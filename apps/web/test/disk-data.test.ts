import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveStoreDir, serveFromDisk } from '../lib/disk-data'
import { proxy } from '../lib/proxy'

let root: string, dataDir: string, emptyDir: string, outside: string
const store = () => join(dataDir, '7738577-0x9548806311')
const parquet = new Uint8Array(Array.from({ length: 64 }, (_, i) => i))
const manifest = { version: 1, snapshotBlock: 100, headBlock: 100, files: { entities: 'snap/v1/entities.parquet', attributes: 'snap/v1/attributes.parquet' }, delta: 'delta.json' }
const failing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
const get = (path: string[], headers: Record<string, string> = {}, method = 'GET') => serveFromDisk(new Request('http://web/data/' + path.join('/'), { method, headers }), path, dataDir)

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'disk-data-'))
  dataDir = join(root, 'data'); emptyDir = join(root, 'empty'); outside = join(root, 'outside')
  await mkdir(join(store(), 'snap', 'v1'), { recursive: true })
  await mkdir(emptyDir); await mkdir(join(outside, 'v9'), { recursive: true })
  await writeFile(join(store(), 'manifest.json'), JSON.stringify(manifest))
  await writeFile(join(store(), 'delta.json'), JSON.stringify({ fromBlock: 101, toBlock: 120, entities: [], attributes: [], tombstones: [] }))
  await writeFile(join(store(), 'snap', 'v1', 'entities.parquet'), parquet)
  await writeFile(join(store(), 'snap', 'v1', 'attributes.parquet'), parquet)
  await writeFile(join(outside, 'secret.json'), '{"secret":true}')
  await writeFile(join(outside, 'v9', 'entities.parquet'), 'secret')
  await symlink(join(outside, 'secret.json'), join(store(), 'snap', 'v1', 'attributes.parquet.link'))
  await symlink(join(outside, 'v9'), join(store(), 'snap', 'v9'))
  await writeFile(join(dataDir, 'index.duckdb'), 'not a store')
})
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

test('resolveStoreDir finds the single store and follows active-generation.json', async () => {
  expect(await resolveStoreDir(dataDir)).toBe(store())
  expect(await resolveStoreDir(emptyDir)).toBeNull()
  expect(await resolveStoreDir(join(root, 'missing'))).toBeNull()
  const gen = join(root, 'gen')
  await mkdir(join(gen, '1-0xabc'), { recursive: true }); await mkdir(join(gen, '1-0xabc-g2'))
  await writeFile(join(gen, '1-0xabc', 'manifest.json'), '{}'); await writeFile(join(gen, '1-0xabc-g2', 'manifest.json'), '{}')
  await writeFile(join(gen, '1-0xabc', 'active-generation.json'), '2')
  expect(await resolveStoreDir(gen)).toBe(join(gen, '1-0xabc-g2'))
})

test('manifest is 200 with ETag, no-cache and x-served-by disk', async () => {
  const response = await get(['manifest.json'])
  expect(response.status).toBe(200)
  expect(response.headers.get('etag')).toMatch(/^"\d+-[\d.]+"$/)
  expect(response.headers.get('cache-control')).toBe('no-cache')
  expect(response.headers.get('content-type')).toBe('application/json')
  expect(response.headers.get('x-served-by')).toBe('disk')
  expect(await response.json()).toEqual(manifest)
})

test('parquet range gives 206 with the requested bytes', async () => {
  const response = await get(['snap', 'v1', 'entities.parquet'], { range: 'bytes=4-9' })
  expect(response.status).toBe(206)
  expect(response.headers.get('content-range')).toBe('bytes 4-9/64')
  expect(response.headers.get('content-length')).toBe('6')
  expect(response.headers.get('accept-ranges')).toBe('bytes')
  expect(response.headers.get('cache-control')).toBe('public, max-age=300, immutable')
  expect(response.headers.get('content-type')).toBe('application/vnd.apache.parquet')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(parquet.slice(4, 10))
  const suffix = await get(['snap', 'v1', 'entities.parquet'], { range: 'bytes=-3' })
  expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(parquet.slice(61))
  expect((await get(['snap', 'v1', 'entities.parquet'], { range: 'bytes=99-' })).status).toBe(416)
})

test('matching ETag gives 304 and HEAD has no body', async () => {
  const etag = (await get(['delta.json'])).headers.get('etag')!
  const response = await get(['delta.json'], { 'if-none-match': etag })
  expect(response.status).toBe(304)
  expect(await response.text()).toBe('')
  const head = await get(['snap', 'v1', 'entities.parquet'], {}, 'HEAD')
  expect(head.status).toBe(200)
  expect(head.headers.get('content-length')).toBe('64')
  expect(await head.text()).toBe('')
})

test('health reports disk source and stored heights', async () => {
  const response = await get(['health'])
  expect(response.status).toBe(200)
  expect(response.headers.get('x-served-by')).toBe('disk')
  expect(await response.json()).toEqual({ source: 'disk', headBlock: 120, lastSnapshot: 100 })
})

test('traversal, absolute paths and symlinks out of the data root give 404', async () => {
  const paths = [['..', 'x'], ['%2e%2e', 'manifest.json'], ['..%2fmanifest.json'], ['/etc/passwd'], [join(outside, 'secret.json')], ['snap', '..', 'manifest.json'],
    ['snap', 'v1', '..', '..', 'manifest.json'], ['snap', 'v9', 'entities.parquet'], ['snap', 'v1', 'missing.parquet'], ['index.duckdb'], ['snap/v1/entities.parquet']]
  for (const path of paths) {
    const response = await get(path)
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('secret')
  }
  expect((await get(['snap', 'v2', 'entities.parquet'])).status).toBe(404)
})

test('empty data dir gives 503 no indexed data', async () => {
  const response = await serveFromDisk(new Request('http://web/data/manifest.json'), ['manifest.json'], emptyDir)
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'no indexed data' })
})

test('proxy falls back to disk when upstream throws or returns 502, 503 or 504', async () => {
  const req = new Request('http://web/data/manifest.json')
  const thrown = await proxy(req, ['manifest.json'], 'http://indexer', failing, dataDir)
  expect(thrown.status).toBe(200)
  expect(thrown.headers.get('x-served-by')).toBe('disk')
  for (const status of [502, 503, 504]) {
    const response = await proxy(req, ['manifest.json'], 'http://indexer', (async () => new Response('down', { status })) as unknown as typeof fetch, dataDir)
    expect(response.headers.get('x-served-by')).toBe('disk')
    expect(await response.json()).toEqual(manifest)
  }
  const empty = await proxy(req, ['manifest.json'], 'http://indexer', failing, emptyDir)
  expect(empty.status).toBe(503)
  expect(await empty.json()).toEqual({ error: 'no indexed data' })
})

test('proxy does not use disk when upstream answers', async () => {
  for (const status of [200, 404, 500]) {
    const response = await proxy(new Request('http://web'), ['manifest.json'], 'http://indexer', (async () => new Response('upstream', { status })) as unknown as typeof fetch, dataDir)
    expect(response.status).toBe(status)
    expect(response.headers.has('x-served-by')).toBe(false)
    expect(await response.text()).toBe('upstream')
  }
  const noDisk = await proxy(new Request('http://web'), ['health'], 'http://indexer', failing)
  expect(noDisk.status).toBe(502)
  const blocked = await proxy(new Request('http://web'), ['..', 'manifest.json'], 'http://indexer', failing, dataDir)
  expect(blocked.status).toBe(404)
})
