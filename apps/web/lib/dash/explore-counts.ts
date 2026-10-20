import { isEntityKey } from './schema'
import type { PendingWrite } from './pending'

/** Keys of pending writes of one kind, deduped, newest write per key wins. */
export function pendingByKey(pending: PendingWrite[], kind: PendingWrite['kind']): Map<string, PendingWrite> {
 const out = new Map<string, PendingWrite>()
 for (const write of pending) if (write.kind === kind && isEntityKey(write.key)) out.set(write.key.toLowerCase(), write)
 return out
}

/** SQL that returns which of `keys` the index already counts (row present and attributes loaded, as the list and count SQL require). Empty string when there is nothing to check. */
export function indexedKeysSql(keys: string[]): string {
 const valid = [...new Set(keys.filter(isEntityKey).map(key => key.toLowerCase()))].sort()
 return valid.length ? `SELECT key FROM entities WHERE key IN (${valid.map(key => `'${key}'`).join(', ')}) AND NOT attrs_pending` : ''
}

/**
 * Count shown on an Explore tab: the indexed SQL count plus pending creates the
 * index does not hold yet, minus pending deletes it still holds. `indexed` is
 * the set of pending keys the index already has (undefined while unknown: then
 * creates count and deletes are ignored). Undefined while the SQL count loads.
 */
export function exploreTabCount(sqlCount: number | undefined, pending: PendingWrite[], kind: PendingWrite['kind'], indexed: ReadonlySet<string> | undefined): number | undefined {
 if (sqlCount === undefined) return undefined
 let count = sqlCount
 for (const [key, write] of pendingByKey(pending, kind)) {
  const known = indexed?.has(key) ?? false
  if (write.op === 'upsert' && !known) count++
  else if (write.op === 'delete' && known) count--
 }
 return Math.max(0, count)
}
