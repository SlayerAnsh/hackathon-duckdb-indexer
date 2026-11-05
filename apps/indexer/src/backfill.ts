import * as T from '@duckdb/node-api'
import { replayTarget } from './replay'
import { decodeEntity, keyChunkQueries, ROW_SELECT, RpcError, type ArkivRpc } from '@asi/core'
import type { Store } from './store'
// Rabdi keeps no historical state and caps a page at 100 entities, and a cursor only pages within one block.
// So the scan reads the latest state in key order, resuming after the last key it saw: rows removed or added
// mid scan never shift the pages. Changes that land during the scan are replayed from logs after it.
export const SCAN_PAGE = 100
export const SCAN_RANGES = 16
export const SCAN_CONCURRENCY = 4
type ScanRange = { lo: string; hi: string | null }
export function scanRanges(n: number): ScanRange[] {
  if (!Number.isInteger(n) || n < 1 || n > 256 || (n & (n - 1)) !== 0) {
    throw Error('Scan ranges must be a positive power of two up to 256')
  }
  const step = (1n << 256n) / BigInt(n)
  const bound = (i: number) => '0x' + (BigInt(i) * step).toString(16).padStart(64, '0')
  return Array.from({ length: n }, (_, i) => ({ lo: bound(i), hi: i + 1 === n ? null : bound(i + 1) }))
}
export function scanQuery(expression: string, after: string | null, range?: ScanRange): string {
  const lower = after ? '$key > key(' + after + ')' : range && BigInt(range.lo) !== 0n ? '$key >= key(' + range.lo + ')' : ''
  const terms = [expression.trim() ? '(' + expression + ')' : '', lower, range?.hi ? '$key < key(' + range.hi + ')' : ''].filter(Boolean)
  return (terms.length ? terms.join(' AND ') : '*') + ' ORDER BY $key:key ASC'
}
async function withRetry<T>(work: () => Promise<T>, log: (msg: string) => void, sleep: (ms: number) => Promise<void>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await work() } catch (error) {
      const limited = error instanceof RpcError && error.status === 429
      const transient = limited || !(error instanceof RpcError) || error.status >= 500
      if (!transient || attempt >= 8) throw error
      const seconds = limited ? Number((error as RpcError).retryAfter) : NaN
      const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : Math.min(30000, 1000 * 2 ** (attempt - 1))
      log('Backfill query retry ' + attempt + ' in ' + Math.round(delay / 1000) + 's: ' + (error instanceof Error ? error.message : String(error)))
      await sleep(delay)
    }
  }
}
export async function backfill(rpc: ArkivRpc, store: Store, expression: string, log: (msg: string) => void = () => {}, opts: { sleep?: (ms: number) => Promise<void>; ranges?: number; concurrency?: number } = {}): Promise<number> {
  const sleep = opts.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const ranges = scanRanges(opts.ranges ?? SCAN_RANGES)
  const concurrency = opts.concurrency ?? SCAN_CONCURRENCY
  if (!Number.isInteger(concurrency) || concurrency < 1) throw Error('Scan concurrency must be a positive integer')
  let count = 0, nextRange = 0, nextLog = 5000, lastBlock = 0
  let failed = false, firstError: unknown
  let writes: Promise<void> = Promise.resolve()
  const fail = (error: unknown) => {
    if (!failed) { failed = true; firstError = error }
  }
  const scan = async (range: ScanRange) => {
    let after: string | null = null
    while (!failed) {
      const page = await withRetry(() => rpc.query(scanQuery(expression, after, range), { limit: SCAN_PAGE, select: ROW_SELECT }), log, sleep)
      if (failed) return
      writes = writes.then(async () => {
        if (failed) return
        await store.transaction(async () => { await store.upsert(page.data.map(decodeEntity), null) })
        count += page.data.length
        lastBlock = page.blockNumber
        if (count >= nextLog) {
          log('Backfilled ' + count + ' rows (latest state, block ' + lastBlock + ')')
          nextLog += 5000
        }
      }).catch(error => { fail(error) })
      await writes
      if (failed || page.data.length < SCAN_PAGE) return
      const last = page.data[page.data.length - 1]!.key
      if (!last || (after !== null && last.toLowerCase() <= after)) throw Error('Backfill scan did not advance')
      after = last.toLowerCase()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ranges.length) }, async () => {
    while (!failed && nextRange < ranges.length) {
      const range = ranges[nextRange++]!
      try { await scan(range) } catch (error) { fail(error) }
    }
  }))
  await writes
  if (failed) throw firstError
  log('Backfilled ' + count + ' rows (latest state, block ' + lastBlock + ') across ' + ranges.length + ' ranges')
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
      const page = await rpc.query(query, { limit: 100, select: ROW_SELECT })
      await store.upsert(page.data.map(decodeEntity), null)
      count += page.data.length
      if (resumable) for (const key of chunk) await store.conn.run('INSERT OR IGNORE INTO replay_fetched VALUES (?)', [key], [T.VARCHAR])
    })
    if (++chunks % 50 === 0) log('Backfilled ' + count + ' rows in ' + chunks + ' key chunks')
  }
  return count
}
