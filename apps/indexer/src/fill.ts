import * as T from '@duckdb/node-api'
import { createRpc, decodeEntity, keyChunkQueries, ROW_SELECT, RpcError, type ArkivRpc } from '@asi/core'
import type { Config } from './config'
import type { Store } from './store'

export type Lock = <R>(fn: () => Promise<R>) => Promise<R>
export type FillResult = { fetched: number; dropped: number; pausedUntil?: number }

// Serialises store access between the sync tick and the filler; RPC calls stay outside it.
export function createLock(): Lock {
  let tail: Promise<unknown> = Promise.resolve()
  return fn => {
    const result = tail.then(fn)
    tail = result.catch(() => {})
    return result
  }
}

export function createFillRpc(config: Config, fetchImpl?: typeof fetch): ArkivRpc {
  return createRpc(config.fillRpcUrl, { ...(config.fillUseApiKey ? { apiKey: config.apiKey } : {}), ...(fetchImpl ? { fetchImpl } : {}) })
}

export function retryAt(retryAfter: string | null, now: number): number {
  const seconds = Number(retryAfter)
  if (retryAfter !== null && retryAfter.trim() !== '' && Number.isFinite(seconds)) return now + Math.max(0, seconds) * 1000
  const date = Date.parse(retryAfter ?? '')
  return Number.isFinite(date) && date > now ? date : now + 60000
}

export const ensureMisses = (store: Store) => store.conn.run('CREATE TABLE IF NOT EXISTS fill_misses(key VARCHAR PRIMARY KEY, misses INTEGER)')

export async function fillPending(rpc: ArkivRpc, store: Store, expression: string, opts: { chunk?: number; lock?: Lock; now?: () => number } = {}): Promise<FillResult> {
  const lock: Lock = opts.lock ?? (fn => fn()), now = opts.now ?? Date.now
  const picked = await lock(async () => {
    if (store.isClosed) return null
    const state = await store.state()
    if (!state) return null
    await ensureMisses(store)
    // Newest first; keys the RPC did not return yet go to the back so they never block the queue.
    const keys = (await store.conn.runAndReadAll(`SELECT e.key FROM entities e LEFT JOIN fill_misses m USING (key) WHERE e.attrs_pending
      ORDER BY coalesce(m.misses, 0), e.updated_at DESC, e.created_at DESC, e.key LIMIT ?`, [opts.chunk ?? 50], [T.INTEGER])).getRowObjects().map(row => String(row.key))
    return { keys, atBlock: state.head_block }
  })
  if (!picked || !picked.keys.length) return { fetched: 0, dropped: 0 }
  const { keys, atBlock } = picked
  const found = new Map<string, ReturnType<typeof decodeEntity>>()
  try {
    let cursor: string | undefined
    do {
      const page = await rpc.query(keyChunkQueries(expression || null, keys)[0]!, { atBlock, cursor, limit: 200, select: ROW_SELECT })
      if (page.blockNumber !== atBlock) throw Error('Fill block mismatch')
      for (const raw of page.data) { const row = decodeEntity(raw); found.set(row.entity.key, row) }
      cursor = page.cursor
    } while (cursor)
  } catch (error) {
    if (error instanceof RpcError && error.status === 429) return { fetched: 0, dropped: 0, pausedUntil: retryAt(error.retryAfter, now()) }
    throw error
  }
  return lock(async () => {
    if (store.isClosed) return { fetched: 0, dropped: 0 }
    const state = (await store.state())!
    // Live sync may have fetched, removed or changed a key while the query ran. Only rows still pending and
    // untouched since the queried block are written; a newer patch, transfer or extension waits for a fresh fill.
    const placeholders = keys.map(() => '?').join(', ')
    const still = (await store.conn.runAndReadAll(`SELECT key, expires_at FROM entities WHERE attrs_pending AND updated_at <= ? AND key IN (${placeholders})`, [atBlock, ...keys], [T.UBIGINT, ...keys.map(() => T.VARCHAR)])).getRowObjects()
    // Keep fills after the published snapshot so the next delta carries them.
    const changeBlock = Math.max(state.head_block, state.snapshot_block + 1)
    let fetched = 0, dropped = 0
    await store.transaction(async () => {
      for (const { key, expires_at } of still.map(row => ({ key: String(row.key), expires_at: Number(row.expires_at) }))) {
        const row = found.get(key)
        if (row) {
          await store.upsert([row], changeBlock); fetched++
          await store.conn.run('DELETE FROM fill_misses WHERE key = ?', [key])
        } else if (expression || expires_at <= atBlock) {
          // Not returned: outside the filter, or expired at the queried block per the log data.
          await store.remove([key], changeBlock); dropped++
          await store.conn.run('DELETE FROM fill_misses WHERE key = ?', [key])
        } else {
          await store.conn.run('INSERT INTO fill_misses VALUES (?, 1) ON CONFLICT (key) DO UPDATE SET misses = misses + 1', [key], [T.VARCHAR])
        }
      }
    })
    return { fetched, dropped }
  })
}

export function fillTask(opts: { rpc: ArkivRpc; store: () => Store; expression: string; chunk: number; lock: Lock; log?: (msg: string) => void; now?: () => number; publish?: () => Promise<void> }): () => Promise<void> {
  const now = opts.now ?? Date.now, log = opts.log ?? console.log
  let running = false, pausedUntil = 0
  return async () => {
    if (running || now() < pausedUntil) return
    running = true
    try {
      const result = await fillPending(opts.rpc, opts.store(), opts.expression, { chunk: opts.chunk, lock: opts.lock, now })
      if (result.pausedUntil !== undefined) {
        pausedUntil = result.pausedUntil
        log('Attribute fill paused by the RPC budget until ' + new Date(pausedUntil).toISOString())
        return
      }
      if ((result.fetched || result.dropped) && opts.publish) await opts.lock(opts.publish)
    } catch (error) {
      log('Attribute fill failed: ' + (error instanceof Error ? error.message : String(error)))
    } finally { running = false }
  }
}
