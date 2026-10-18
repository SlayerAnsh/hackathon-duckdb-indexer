import * as T from '@duckdb/node-api'
import { clampBlock, ENTITY_EVENTS_ABI, decodeEventLog, RpcError, type ArkivRpc, type RawLog } from '@asi/core'
import type { Store } from './store'

export async function fetchLogsAdaptive(rpc: ArkivRpc, from: number, to: number, onWindow: (logs: RawLog[], from: number, to: number) => Promise<void>, opts: { window?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<void> {
  let window = opts.window ?? 20000
  if (!Number.isSafeInteger(window) || window < 1) throw Error('Invalid log window')
  const sleep = opts.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  let start = from, end = Math.min(to, from + window - 1)
  while (start <= to) {
    let logs: RawLog[]
    try { logs = await rpc.getLogs(start, end) }
    catch (error) {
      if (error instanceof RpcError && error.status === 429) {
        const seconds = Number(error.retryAfter)
        const delay = error.retryAfter === null ? 1000 : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(error.retryAfter) - Date.now()
        await sleep(Number.isFinite(delay) ? Math.max(0, delay) : 1000)
        continue
      }
      if (!(error instanceof RpcError && error.code === -32602 && /max results/i.test(error.message)) || start === end) throw error
      const range = /retry with the range\s+(\d+)-(\d+)/i.exec(error.message)
      if (range && Number(range[1]) === start && Number(range[2]) >= start && Number(range[2]) < end) end = Number(range[2])
      else end = start + Math.floor((end - start + 1) / 2) - 1
      window = end - start + 1
      continue
    }
    await onWindow(logs, start, end)
    start = end + 1
    end = Math.min(to, start + window - 1)
  }
}

export async function replayTarget(store: Store): Promise<number | null> {
  const exists = (await store.conn.runAndReadAll("SELECT 1 FROM information_schema.tables WHERE table_name = 'replay_target'")).getRowObjects().length
  if (!exists) return null
  const row = (await store.conn.runAndReadAll('SELECT block FROM replay_target')).getRowObjects()[0]
  return row ? Number(row.block) : null
}
export async function clearReplay(store: Store): Promise<void> {
  await store.conn.run('DROP TABLE IF EXISTS replay_events; DROP TABLE IF EXISTS replay_state; DROP TABLE IF EXISTS replay_live; DROP TABLE IF EXISTS replay_target; DROP TABLE IF EXISTS replay_fetched')
}

export async function replayLiveKeys(rpc: ArkivRpc, store: Store, toBlock: number, log: (msg: string) => void = () => {}): Promise<string[]> {
  const target = await replayTarget(store)
  if (target !== null && target !== toBlock) await store.transaction(async () => {
    await clearReplay(store)
    await store.conn.run('DELETE FROM attributes; DELETE FROM entities; DELETE FROM changes')
  })
  const completed = (await store.conn.runAndReadAll("SELECT 1 FROM information_schema.tables WHERE table_name = 'replay_live'")).getRowObjects().length
  if (completed) return (await store.conn.runAndReadAll('SELECT key FROM replay_live ORDER BY key')).getRowObjects().map(row => String(row.key))
  await store.conn.run('CREATE TABLE IF NOT EXISTS replay_target(block UBIGINT); CREATE TABLE IF NOT EXISTS replay_events(key VARCHAR, kind VARCHAR, block UBIGINT, log_index INTEGER, expires_at UBIGINT, PRIMARY KEY(block, log_index)); CREATE TABLE IF NOT EXISTS replay_state(next_block UBIGINT)')
  if (await replayTarget(store) === null) await store.conn.run('INSERT INTO replay_target VALUES (?)', [toBlock], [T.UBIGINT])
  const state = (await store.conn.runAndReadAll('SELECT next_block FROM replay_state')).getRowObjects()[0]
  const from = state ? Number(state.next_block) : 0
  await fetchLogsAdaptive(rpc, from, toBlock, async (logs, _from, to) => {
    await store.transaction(async () => {
      for (const entry of logs) {
        const decoded = decodeEventLog({ abi: ENTITY_EVENTS_ABI, topics: entry.topics as [`0x${string}`, ...`0x${string}`[]], data: entry.data as `0x${string}` })
        const expiry = 'expiresAt' in decoded.args ? clampBlock(decoded.args.expiresAt) : null
        await store.conn.run('INSERT OR IGNORE INTO replay_events VALUES (?, ?, ?, ?, ?)', [decoded.args.entityKey.toLowerCase(), decoded.eventName, entry.blockNumber, entry.logIndex, expiry], [T.VARCHAR, T.VARCHAR, T.UBIGINT, T.INTEGER, T.UBIGINT])
      }
      await store.conn.run('DELETE FROM replay_state')
      await store.conn.run('INSERT INTO replay_state VALUES (?)', [to + 1], [T.UBIGINT])
    })
    log('Replayed logs through block ' + to)
  })
  await store.transaction(async () => {
    await store.conn.run('CREATE TABLE replay_live(key VARCHAR PRIMARY KEY)')
    await store.conn.run(`INSERT INTO replay_live
    SELECT key FROM replay_events WHERE block <= ?
    GROUP BY key
    HAVING count(*) FILTER (WHERE kind = 'EntityCreated') > 0
      AND first(kind ORDER BY block DESC, log_index DESC) <> 'EntityDeleted'
      AND first(expires_at ORDER BY block DESC, log_index DESC) FILTER (WHERE expires_at IS NOT NULL) > ?
    ORDER BY key`, [toBlock, toBlock], [T.UBIGINT, T.UBIGINT])
  })
  return (await store.conn.runAndReadAll('SELECT key FROM replay_live ORDER BY key')).getRowObjects().map(row => String(row.key))
}
