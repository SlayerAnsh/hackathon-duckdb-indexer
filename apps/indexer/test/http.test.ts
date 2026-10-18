import { test, expect } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { bootstrappingHandler, createHandler } from '../src/http'
import { temp } from './helpers'
test('HTTP bootstrap health and path allowlist', async () => {
  const handle = bootstrappingHandler(), req = (p: string) => handle(new Request('http://local' + p))
  const health = await req('/health'); expect(health.status).toBe(200); expect(health.headers.get('cache-control')).toBe('no-store'); expect(await health.json()).toEqual({ bootstrapping: true, headBlock: null, headLag: null, lastSnapshot: null })
  for (const p of ['/manifest.json', '/delta.json', '/snap/v1/entities.parquet', '/snap/v2/attributes.parquet']) expect((await req(p)).status).toBe(503)
  for (const p of ['/unknown', '/index.duckdb', '/snap/v1/no.parquet']) expect((await req(p)).status).toBe(404)
})
test('HTTP files, conditional requests, ranges, health and path allowlist', async () => {
  const dir = await temp(); await mkdir(dir + '/snap/v1', { recursive: true })
  await writeFile(dir + '/manifest.json', '{}'); await writeFile(dir + '/delta.json', '{}')
  const bytes = Uint8Array.from({ length: 200 }, (_, n) => n)
  await writeFile(dir + '/snap/v1/entities.parquet', bytes)
  const handle = createHandler(dir, () => ({ head: 100 })), req = (p: string, headers = {}) => handle(new Request('http://local' + p, { headers }))
  const manifest = await req('/manifest.json'); expect(manifest.status).toBe(200); expect(manifest.headers.get('cache-control')).toBe('no-cache'); expect(manifest.headers.get('etag')).toBeTruthy()
  const delta = await req('/delta.json'); const cached = await req('/delta.json', { 'if-none-match': delta.headers.get('etag')! }); expect(cached.status).toBe(304); expect(await cached.text()).toBe('')
  const parquet = await req('/snap/v1/entities.parquet'); expect(parquet.status).toBe(200); expect(parquet.headers.get('cache-control')).toBe('public, max-age=300, immutable'); expect(parquet.headers.get('accept-ranges')).toBe('bytes')
  const partial = await req('/snap/v1/entities.parquet', { range: 'bytes=0-99' }); expect(partial.status).toBe(206); expect(partial.headers.get('content-range')).toBe('bytes 0-99/200'); expect(partial.headers.get('content-length')).toBe('100'); expect(new Uint8Array(await partial.arrayBuffer())).toEqual(bytes.slice(0, 100))
  expect(await (await req('/health')).json()).toEqual({ head: 100 })
  for (const p of ['/index.duckdb', '/snap/../index.duckdb', '/snap/%2e%2e/index.duckdb', '/snap/v1/no.parquet']) expect((await req(p)).status).toBe(404)
  expect((await req('/snap/v1/entities.parquet', { range: 'bytes=200-' })).status).toBe(416)
})
