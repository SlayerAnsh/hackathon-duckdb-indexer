import { decodeEntity, ROW_SELECT, type ArkivRpc } from '@asi/core'
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
