import * as T from '@duckdb/node-api'
import { replayTarget } from './replay'
import { decodeEntity, keyChunkQueries, ROW_SELECT, type ArkivRpc } from '@asi/core'
import type { Store } from './store'
export async function backfill(rpc: ArkivRpc, store: Store, expression: string, atBlock: number, log: (msg: string) => void = () => {}): Promise<number> {
  let cursor: string | undefined, count = 0
  do {
    const page = await rpc.query(expression, { atBlock, cursor, limit: 200, select: ROW_SELECT })
    await store.transaction(async () => { await store.upsert(page.data.map(decodeEntity), null) })
    count += page.data.length
    log('Backfilled ' + count + ' rows at block ' + atBlock)
    cursor = page.cursor
  } while (cursor)
  return count
}

export async function backfillByKeys(rpc: ArkivRpc, store: Store, expression: string, keys: string[], atBlock: number, log: (msg: string) => void = () => {}): Promise<number> {
  let count = 0, chunks = 0
  const resumable = await replayTarget(store) === atBlock
  if (resumable) await store.conn.run('CREATE TABLE IF NOT EXISTS replay_fetched(key VARCHAR PRIMARY KEY)')
  const fetched = resumable ? new Set((await store.conn.runAndReadAll('SELECT key FROM replay_fetched')).getRowObjects().map(row => String(row.key))) : new Set<string>()
  const pending = keys.filter(key => !fetched.has(key))
  for (let offset = 0; offset < pending.length; offset += 50) {
    const chunk = pending.slice(offset, offset + 50)
    const query = keyChunkQueries(expression || null, chunk)[0]!

    await store.transaction(async () => {
      let cursor: string | undefined
      do {
        const page = await rpc.query(query, { atBlock, cursor, limit: 200, select: ROW_SELECT })
        if (page.blockNumber !== atBlock) throw Error('Snapshot block mismatch')
        await store.upsert(page.data.map(decodeEntity), null)
        count += page.data.length
        cursor = page.cursor
      } while (cursor)
      if (resumable) for (const key of chunk) await store.conn.run('INSERT OR IGNORE INTO replay_fetched VALUES (?)', [key], [T.VARCHAR])
    })
    if (++chunks % 50 === 0) log('Backfilled ' + count + ' rows in ' + chunks + ' key chunks')
  }
  return count
}
