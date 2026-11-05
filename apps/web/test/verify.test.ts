import { afterEach, expect, test } from 'bun:test'
import { verifyRows } from '../lib/verify'
const original = globalThis.fetch
afterEach(() => { globalThis.fetch = original })
test('verification uses bounded latest reads for every key chunk and ignores block bound cursors', async () => {
 const keys = Array.from({ length: 121 }, (_, i) => `0x${i.toString(16).padStart(64, '0')}`)
 const owner = `0x${'ab'.repeat(20)}`
 const calls: any[] = []
 globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
  const { params } = JSON.parse(String(init.body))
  calls.push(params)
  const selected = keys.filter(k => params[0].includes(k)).filter(k => k !== keys[120])
  return Response.json({ result: { data: selected.map(key => ({ key, owner, updatedAt: '0x5', expiresAt: '0xff' })), blockNumber: '0x10', cursor: 'unusable-on-next-block' } })
 }) as typeof fetch
 const result = await verifyRows('https://rpc.test', [...keys, keys[0]])
 expect(calls).toHaveLength(3)
 for (const [, options] of calls) expect(options).toEqual({ limit: '0x64', select: { key: true, updatedAt: true, expiresAt: true, owner: true } })
 expect(result.size).toBe(121)
 for (const key of keys.slice(0, 120)) expect(result.get(key)).toEqual({ owner, updatedAt: 5, expiresAt: 255 })
 expect(result.get(keys[120])).toBeNull()
})
