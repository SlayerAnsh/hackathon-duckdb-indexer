import { test, expect } from 'bun:test'
import { IndexDb } from '../lib/indexdb'
test('display caps rows while full export reads all rows', async () => {
 const run = async (cap?: number) => {
 const batch = { numRows: 1002, getChildAt: () => ({ get: (i: number) => BigInt(i) }) }
 const reader = { schema: { fields: [{ name: 'n' }] }, async *[Symbol.asyncIterator]() { yield batch }, cancel: async () => {} }
 const fake = { serial: (fn: () => unknown) => fn(), queries: { send: async () => reader }, cancel: async () => {} }
 return IndexDb.prototype.run.call(fake as never, 'SELECT 1', cap)
 }
 expect((await run()).rows.length).toBe(1000)
 expect((await run(Infinity)).rows.length).toBe(1002)
 expect((await run(Infinity)).truncated).toBe(false)
})
