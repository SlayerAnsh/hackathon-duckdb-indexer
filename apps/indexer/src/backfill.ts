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
  for (const query of keyChunkQueries(expression || null, keys)) {
    await store.transaction(async () => {
      let cursor: string | undefined
      do {
        const page = await rpc.query(query, { atBlock, cursor, limit: 200, select: ROW_SELECT })
        if (page.blockNumber !== atBlock) throw Error('Snapshot block mismatch')
        await store.upsert(page.data.map(decodeEntity), null)
        count += page.data.length
        cursor = page.cursor
      } while (cursor)
    })
    if (++chunks % 50 === 0) log('Backfilled ' + count + ' rows in ' + chunks + ' key chunks')
  }
  return count
}
