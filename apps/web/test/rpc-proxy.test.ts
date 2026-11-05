import { afterEach, expect, test } from 'bun:test'
import { handleRpcProxy, MAX_BATCH, MAX_BODY_BYTES, readRpcProxyEnv, TokenBucket, type RpcProxyDeps } from '../lib/dash/server/rpc-proxy'
import { browserRpcUrl, createBrowserRpc } from '../lib/rpc-browser'

const KEY = 'test-key-do-not-leak'
const UPSTREAM = 'http://upstream.test/rpc'
type Call = { url: string; init: RequestInit }
function fakeFetch(respond: (call: Call) => Response | Promise<Response> = () => Response.json({ jsonrpc: '2.0', id: 1, result: '0x10' })) {
  const calls: Call[] = []
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} }
    calls.push(call)
    return respond(call)
  }) as unknown as typeof fetch
  return { calls, impl }
}
const deps = (over: Partial<RpcProxyDeps> = {}): RpcProxyDeps => ({ upstreamUrl: UPSTREAM, limiter: new TokenBucket(10, 30), ...over })
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://web/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
const call = (method: string, params: unknown[] = []) => ({ jsonrpc: '2.0', id: 1, method, params })

test('allowlisted method is forwarded with the bearer key when set', async () => {
  const { calls, impl } = fakeFetch()
  const res = await handleRpcProxy(post(call('arkiv_query', ['$owner = addr(0x1)', { select: { key: true } }])), deps({ apiKey: KEY, fetchImpl: impl }))
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ jsonrpc: '2.0', id: 1, result: '0x10' })
  expect(calls).toHaveLength(1)
  expect(calls[0].url).toBe(UPSTREAM)
  expect(new Headers(calls[0].init.headers).get('authorization')).toBe(`Bearer ${KEY}`)
  expect(JSON.parse(String(calls[0].init.body))).toEqual(call('arkiv_query', ['$owner = addr(0x1)', { select: { key: true } }]))
})

test('without a key the request is forwarded anonymously', async () => {
  const { calls, impl } = fakeFetch()
  for (const method of ['eth_blockNumber', 'eth_chainId', 'eth_getBalance', 'eth_getBlockByNumber', 'eth_getLogs']) {
    const res = await handleRpcProxy(post(call(method)), deps({ fetchImpl: impl }))
    expect(res.status).toBe(200)
  }
  expect(calls).toHaveLength(5)
  for (const c of calls) expect(new Headers(c.init.headers).has('authorization')).toBe(false)
})

test('disallowed methods are rejected with 400 and never reach upstream', async () => {
  const { calls, impl } = fakeFetch()
  for (const method of ['eth_sendRawTransaction', 'eth_sendTransaction', 'eth_sign', 'personal_sign', 'eth_signTypedData_v4', 'eth_accounts', 'debug_traceTransaction', 'admin_peers']) {
    const res = await handleRpcProxy(post(call(method)), deps({ apiKey: KEY, fetchImpl: impl }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.jsonrpc).toBe('2.0')
    expect(body.error.code).toBe(-32601)
  }
  const batch = await handleRpcProxy(post([call('eth_blockNumber'), call('eth_sendRawTransaction', ['0x00'])]), deps({ apiKey: KEY, fetchImpl: impl }))
  expect(batch.status).toBe(400)
  expect(calls).toHaveLength(0)
})

test('malformed requests are rejected', async () => {
  const { calls, impl } = fakeFetch()
  for (const body of ['not json', '[]', '{"jsonrpc":"1.0","id":1,"method":"eth_chainId"}', '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":{}}', JSON.stringify(Array.from({ length: MAX_BATCH + 1 }, () => call('eth_chainId')))]) {
    expect((await handleRpcProxy(post(body), deps({ fetchImpl: impl }))).status).toBe(400)
  }
  expect(calls).toHaveLength(0)
})

test('batches up to the cap are forwarded as an array', async () => {
  const { calls, impl } = fakeFetch(() => Response.json([{ jsonrpc: '2.0', id: 1, result: '0x1' }, { jsonrpc: '2.0', id: 2, result: '0x2' }]))
  const res = await handleRpcProxy(post([call('eth_chainId'), { ...call('eth_blockNumber'), id: 2 }]), deps({ fetchImpl: impl }))
  expect(res.status).toBe(200)
  expect(JSON.parse(String(calls[0].init.body))).toHaveLength(2)
})

test('oversized body is rejected before parsing', async () => {
  const { calls, impl } = fakeFetch()
  const big = JSON.stringify(call('arkiv_query', ['x'.repeat(MAX_BODY_BYTES), {}]))
  const res = await handleRpcProxy(post(big), deps({ fetchImpl: impl }))
  expect(res.status).toBe(413)
  expect((await res.json()).error.code).toBe(-32600)
  // A streamed body without content-length is capped as well.
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close() } })
  const streamed = await handleRpcProxy(new Request('http://web/api/rpc', { method: 'POST', body: stream, duplex: 'half' } as RequestInit), deps({ fetchImpl: impl }))
  expect(streamed.status).toBe(413)
  expect(calls).toHaveLength(0)
})

test('rate limit returns 429 per client ip and refills over time', async () => {
  let now = 0
  const limiter = new TokenBucket(10, 3, () => now)
  const { impl } = fakeFetch()
  const ip = { 'x-forwarded-for': '203.0.113.7' }
  for (let i = 0; i < 3; i++) expect((await handleRpcProxy(post(call('eth_chainId'), ip), deps({ limiter, fetchImpl: impl }))).status).toBe(200)
  const limited = await handleRpcProxy(post(call('eth_chainId'), ip), deps({ limiter, fetchImpl: impl }))
  expect(limited.status).toBe(429)
  expect((await limited.json()).error.message).toBe('Too many requests')
  expect((await handleRpcProxy(post(call('eth_chainId'), { 'x-forwarded-for': '203.0.113.8' }), deps({ limiter, fetchImpl: impl }))).status).toBe(200)
  now += 200
  expect((await handleRpcProxy(post(call('eth_chainId'), ip), deps({ limiter, fetchImpl: impl }))).status).toBe(200)
})

test('upstream errors pass through with status and body, without the key or upstream headers', async () => {
  const upstreamBody = { jsonrpc: '2.0', id: 1, error: { code: -32004, message: `quota exhausted for ${KEY}` } }
  const { impl } = fakeFetch(() => new Response(JSON.stringify(upstreamBody), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '30', 'x-upstream-secret': 'internal', 'set-cookie': 'a=b' } }))
  const res = await handleRpcProxy(post(call('arkiv_query', ['x', {}])), deps({ apiKey: KEY, fetchImpl: impl }))
  expect(res.status).toBe(429)
  expect(res.headers.get('retry-after')).toBe('30')
  expect(res.headers.has('x-upstream-secret')).toBe(false)
  expect(res.headers.has('set-cookie')).toBe(false)
  const text = await res.text()
  expect(text).not.toContain(KEY)
  expect(JSON.parse(text).error.code).toBe(-32004)
})

test('upstream failure and timeout give 502 and 504 without leaking the key', async () => {
  const failing = fakeFetch(() => { throw new Error(`connect failed with Bearer ${KEY}`) })
  const failed = await handleRpcProxy(post(call('eth_chainId')), deps({ apiKey: KEY, fetchImpl: failing.impl }))
  expect(failed.status).toBe(502)
  expect(await failed.text()).not.toContain(KEY)
  const hanging = (async (_url: unknown, init?: RequestInit) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))) as unknown as typeof fetch
  const timedOut = await handleRpcProxy(post(call('eth_chainId')), deps({ apiKey: KEY, fetchImpl: hanging, timeoutMs: 20 }))
  expect(timedOut.status).toBe(504)
  expect(await timedOut.text()).not.toContain(KEY)
})

test('env reader uses the server key and the public RPC default', () => {
  expect(readRpcProxyEnv({})).toEqual({ upstreamUrl: 'https://rpc.rabdi.db-chain.testnet.arkiv.network' })
  expect(readRpcProxyEnv({ ARKIV_API_KEY: ' k ', NEXT_PUBLIC_ARKIV_RPC_URL: 'http://rpc' })).toEqual({ upstreamUrl: 'http://rpc', apiKey: 'k' })
  expect(readRpcProxyEnv({ ARKIV_API_KEY: '  ' })).not.toHaveProperty('apiKey')
})

const g = globalThis as { window?: unknown; fetch: typeof fetch }
const originalFetch = globalThis.fetch
afterEach(() => { delete g.window; globalThis.fetch = originalFetch })

test('createBrowserRpc targets the same origin /api/rpc proxy in a browser', async () => {
  g.window = { location: { origin: 'http://app.test' } }
  const urls: string[] = []
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(url))
    expect(new Headers(init?.headers).has('authorization')).toBe(false)
    return Response.json({ jsonrpc: '2.0', id: 1, result: '0x2a' })
  }) as typeof fetch
  expect(await createBrowserRpc('https://rpc.rabdi.db-chain.testnet.arkiv.network').blockNumber()).toBe(42)
  expect(urls).toEqual(['http://app.test/api/rpc'])
  expect(browserRpcUrl('https://public')).toBe('http://app.test/api/rpc')
})

test('outside a browser the given url is used', () => {
  expect(browserRpcUrl('http://fake')).toBe('http://fake')
})
