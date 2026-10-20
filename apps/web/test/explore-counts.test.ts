import { expect, test } from 'bun:test'
import { exploreTabCount, indexedKeysSql, pendingByKey } from '../lib/dash/explore-counts'
import type { PendingWrite } from '../lib/dash/pending'

const key = (n: number) => '0x' + n.toString(16).padStart(64, '0')
const w = (n: number, patch: Partial<PendingWrite> = {}): PendingWrite => ({ key: key(n), kind: 'widget', op: 'upsert', afterBlock: 1, at: 0, ...patch })

test('tab count adds pending creates the index does not count yet', () => {
 expect(exploreTabCount(0, [w(1)], 'widget', new Set())).toBe(1)
 expect(exploreTabCount(0, [w(1)], 'widget', undefined)).toBe(1)
 expect(exploreTabCount(5, [w(1)], 'widget', new Set([key(1)]))).toBe(5)
})
test('tab count dedupes by key, ignores other kinds and waits for the SQL count', () => {
 expect(exploreTabCount(2, [w(1), w(1), { ...w(1), key: key(1).toUpperCase().replace('0X', '0x') }], 'widget', new Set())).toBe(3)
 expect(exploreTabCount(2, [w(1, { kind: 'dashboard' }), w(2, { kind: 'link' })], 'widget', new Set())).toBe(2)
 expect(exploreTabCount(2, [w(1, { kind: 'dashboard' })], 'dashboard', new Set())).toBe(3)
 expect(exploreTabCount(undefined, [w(1)], 'widget', new Set())).toBeUndefined()
})
test('tab count subtracts pending deletes the index still counts, never below zero', () => {
 expect(exploreTabCount(3, [w(1, { op: 'delete' })], 'widget', new Set([key(1)]))).toBe(2)
 expect(exploreTabCount(3, [w(1, { op: 'delete' })], 'widget', new Set())).toBe(3)
 expect(exploreTabCount(3, [w(1, { op: 'delete' })], 'widget', undefined)).toBe(3)
 expect(exploreTabCount(0, [w(1, { op: 'delete' })], 'widget', new Set([key(1)]))).toBe(0)
 expect(pendingByKey([w(1), w(1, { op: 'delete' })], 'widget').get(key(1))?.op).toBe('delete')
})
test('indexed keys SQL checks only valid keys with loaded attributes', () => {
 expect(indexedKeysSql([])).toBe('')
 expect(indexedKeysSql(["x' OR 1=1"])).toBe('')
 const sql = indexedKeysSql([key(2), key(1), key(1)])
 expect(sql).toBe(`SELECT key FROM entities WHERE key IN ('${key(1)}', '${key(2)}') AND NOT attrs_pending`)
})
