import { expect, test } from 'bun:test'
import { fetchDashWallet } from '../lib/dash/config'

test('wallet fetch retries failures and shares the successful request', async () => {
 let calls = 0
 const wallet = '0x' + 'AB'.repeat(20)
 const fake = (async (url: string, init?: RequestInit) => {
  expect(url).toBe('/api/dash/config')
  expect(init?.cache).toBe('no-store')
  calls++
  if (calls === 1) throw new Error('offline failure')
  return Response.json({ wallet })
 }) as typeof fetch
 expect(await fetchDashWallet(fake)).toBeNull()
 const results = await Promise.all([fetchDashWallet(fake), fetchDashWallet(fake)])
 expect(results).toEqual([wallet.toLowerCase(), wallet.toLowerCase()])
 expect(calls).toBe(2)
 expect(await fetchDashWallet(fake)).toBe(wallet.toLowerCase())
 expect(calls).toBe(2)
})
