import { test, expect } from 'bun:test'
import { createRpc, ROW_SELECT, RpcError } from '../src/rpc'
function fake(result: unknown, status = 200, headers = {}) {
  const calls: { body: any; headers: Headers }[] = []
  const fetchImpl = (async (_url, init) => {
    calls.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) })
    return new Response(JSON.stringify(result), { status, headers })
  }) as typeof fetch
  return { calls, fetchImpl }
}
test('sends bearer header when apiKey set', async () => {
  const f = fake({ result: '0x1' }); await createRpc('url', { ...f, apiKey: 'k1' }).chainId()
  expect(f.calls[0]!.headers.get('authorization')).toBe('Bearer k1')
})
test('query encodes atBlock and limit as hex', async () => {
  const f = fake({ result: { data: [], blockNumber: '0xb5591' } })
  const page = await createRpc('url', f).query('x', { atBlock: 742801, limit: 200, select: ROW_SELECT })
  expect(f.calls[0]!.body.params).toEqual(['x', { atBlock: '0xb5591', limit: '0xc8', select: ROW_SELECT }])
  expect(page.blockNumber).toBe(742801); expect(page.cursor).toBeUndefined()
  expect(ROW_SELECT).toEqual({ key: true, owner: true, creator: true, createdAt: true, updatedAt: true, expiresAt: true, creationFlags: true, contentType: true, attributes: true })
})
test('query passes cursor through', async () => {
  const f = fake({ result: { data: [], blockNumber: '0x1', cursor: 'next' } })
  expect((await createRpc('url', f).query('x', { cursor: 'prev', select: ROW_SELECT })).cursor).toBe('next')
  expect(f.calls[0]!.body.params[1].cursor).toBe('prev')
})
test('throws RpcError on 429 plain body', async () => {
  const f = fake({ error: 'ANON_COST_LIMITED', message: 'quota' }, 429)
  try { await createRpc('url', f).blockNumber(); throw Error('expected rejection') } catch (e) {
    expect(e).toBeInstanceOf(RpcError); expect(e).toMatchObject({ status: 429, code: 'ANON_COST_LIMITED' })
  }
})
test('throws RpcError on json-rpc error', async () => {
  const f = fake({ jsonrpc: '2.0', id: 1, error: { code: -32004, message: 'query is too long' } })
  await expect(createRpc('url', f).blockNumber()).rejects.toMatchObject({ status: 200, code: -32004, message: 'query is too long' })
})
test('reports cost headers', async () => {
  const f = fake({ result: '0x10' }, 200, { 'arkiv-cost': '100', 'arkiv-quota-used-percent': '1' })
  const costs: unknown[] = []
  expect(await createRpc('url', { ...f, onCost: (...args) => costs.push(args) }).blockNumber()).toBe(16)
  expect(costs).toEqual([[100, 1]])
})
test('reports missing quota as null', async () => {
  const f = fake({ result: '0x1' }, 200, { 'arkiv-cost': '100' }); const costs: unknown[] = []
  await createRpc('url', { ...f, onCost: (...args) => costs.push(args) }).chainId()
  expect(costs).toEqual([[100, null]])
})
test('genesisHash reads block 0', async () => {
  const f = fake({ result: { hash: '0xabc' } }); expect(await createRpc('url', f).genesisHash()).toBe('0xabc')
  expect(f.calls[0]!.body).toMatchObject({ method: 'eth_getBlockByNumber', params: ['0x0', false] })
})
test('getLogs splits nothing and decodes numbers', async () => {
  const f = fake({ result: [{ topics: ['0xaa'], data: '0x', blockNumber: '0x10', logIndex: '0x2', transactionHash: '0xbb' }] })
  expect(await createRpc('url', f).getLogs(16, 32)).toEqual([{ topics: ['0xaa'], data: '0x', blockNumber: 16, logIndex: 2, transactionHash: '0xbb' }])
  expect(f.calls).toHaveLength(1)
  expect(f.calls[0]!.body).toMatchObject({ method: 'eth_getLogs', params: [{ address: '0x4400000000000000000000000000000000000044', fromBlock: '0x10', toBlock: '0x20' }] })
})
test('blockHash reads numeric header and rejects missing blocks', async () => {
  const f = fake({ result: { hash: '0xABC' } })
  expect(await createRpc('url', f).blockHash(105)).toBe('0xabc')
  expect(f.calls[0]!.body).toMatchObject({ method: 'eth_getBlockByNumber', params: ['0x69', false] })
  await expect(createRpc('url', fake({ result: null })).blockHash(105)).rejects.toThrow('Block hash unavailable')
})
test('rate limits retain Retry-After', async () => {
  await expect(createRpc('url', fake({ error: 'ANON_COST_LIMITED' }, 429, { 'retry-after': '30' })).blockNumber()).rejects.toMatchObject({ retryAfter: '30', status: 429 })
})
