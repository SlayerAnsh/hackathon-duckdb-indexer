import { expect, test } from 'bun:test'
import { proxy } from '../lib/proxy'

test('forwards range and conditional headers, uses no-store', async () => {
  const headers = { range: 'bytes=0-9', 'if-none-match': '"v1"', 'if-modified-since': 'today', cookie: 'secret', authorization: 'secret' }
  await proxy(new Request('http://web/data/manifest.json', { headers }), ['manifest.json'], 'http://indexer', (async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(url)).toBe('http://indexer/manifest.json')
    expect(init?.cache).toBe('no-store')
    const sent = new Headers(init?.headers)
    for (const name of ['range', 'if-none-match', 'if-modified-since']) expect(sent.get(name)).toBe(headers[name as keyof typeof headers])
    expect(sent.has('cookie')).toBe(false)
    expect(sent.has('authorization')).toBe(false)
    return new Response('ok')
  }) as unknown as typeof fetch)
})

test('passes 206 through', async () => {
  const headers = { 'content-range': 'bytes 0-2/10', 'content-length': '3', 'accept-ranges': 'bytes', etag: '"v1"', 'cache-control': 'no-cache', 'content-type': 'application/octet-stream' }
  const response = await proxy(new Request('http://web'), ['snap', 'v1', 'entities.parquet'], 'http://indexer', (async () => new Response(new Uint8Array([0, 128, 255]), { status: 206, headers })) as unknown as typeof fetch)
  expect(response.status).toBe(206)
  for (const [name, value] of Object.entries(headers)) expect(response.headers.get(name)).toBe(value)
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 128, 255]))
})

test('passes 304 through', async () => {
  const response = await proxy(new Request('http://web'), ['delta.json'], 'http://indexer', (async () => new Response(null, { status: 304 })) as unknown as typeof fetch)
  expect(response.status).toBe(304)
  expect(await response.text()).toBe('')
})

test('rejects disallowed paths', async () => {
  for (const path of [['index.duckdb'], ['..', 'x'], ['snap', 'v1', 'x.parquet'], ['https://evil/manifest.json'], ['snap/v1/entities.parquet']]) {
    const response = await proxy(new Request('http://web'), path, 'http://indexer', (async () => { throw new Error('must not fetch') }) as unknown as typeof fetch)
    expect(response.status).toBe(404)
  }
})

test('upstream failure gives 502', async () => {
  const response = await proxy(new Request('http://web'), ['health'], 'http://indexer', (async () => { throw new Error('offline') }) as unknown as typeof fetch)
  expect(response.status).toBe(502)
  expect(await response.text()).toContain('indexer unavailable')
})

test('mutable files are fetched again and HEAD has no body', async () => {
  let version = 0
  const fake = (async () => new Response(String(++version))) as unknown as typeof fetch
  const req = new Request('http://web')
  expect(await (await proxy(req, ['manifest.json'], 'http://indexer', fake)).text()).toBe('1')
  expect(await (await proxy(req, ['manifest.json'], 'http://indexer', fake)).text()).toBe('2')
  expect(await (await proxy(new Request('http://web', { method: 'HEAD' }), ['manifest.json'], 'http://indexer', fake)).text()).toBe('')
})
