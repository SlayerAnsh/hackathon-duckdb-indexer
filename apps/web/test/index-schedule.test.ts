import { expect, test } from 'bun:test'
import type { Manifest } from '@asi/core'
import { IndexDb, IndexUnavailable, QueryCancelled, ReadyGate, downloadBytes, snapshotPlan } from '../lib/indexdb'

const MIN = 60_000

test('snapshotPlan loads the first snapshot and keeps the same version', () => {
  expect(snapshotPlan({ latestVersion: 5, loadedAt: 0, now: 0, tailing: false })).toBe('load')
  expect(snapshotPlan({ loadedVersion: 5, latestVersion: 5, loadedAt: 0, now: 99 * MIN, tailing: false })).toBe('keep')
})

test('snapshotPlan keeps a live tailed snapshot until it is older than the max age', () => {
  const base = { loadedVersion: 5, latestVersion: 6, loadedAt: 1000, tailing: true }
  expect(snapshotPlan({ ...base, now: 1000 + MIN })).toBe('keep')
  expect(snapshotPlan({ ...base, now: 1000 + 10 * MIN - 1 })).toBe('keep')
  expect(snapshotPlan({ ...base, now: 1000 + 10 * MIN })).toBe('load')
  expect(snapshotPlan({ ...base, now: 1000 + 2 * MIN, maxAgeMs: 2 * MIN })).toBe('load')
})

test('snapshotPlan reloads a new version at once when nothing keeps the old one current', () => {
  expect(snapshotPlan({ loadedVersion: 5, latestVersion: 6, loadedAt: 1000, now: 1001, tailing: false })).toBe('load')
})

const streamOf = (chunks: Uint8Array[], stallAfter = Infinity) => new ReadableStream<Uint8Array>({
  start(controller) {
    chunks.slice(0, stallAfter).forEach(chunk => controller.enqueue(chunk))
    if (stallAfter >= chunks.length) controller.close()
  },
})

test('downloadBytes joins the streamed chunks', async () => {
  const fake = (async () => new Response(streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]), { headers: { 'content-length': '3' } })) as unknown as typeof fetch
  expect([...await downloadBytes('http://x/data/snap/v1/entities.parquet', { fetch: fake })]).toEqual([1, 2, 3])
})

test('downloadBytes fails on an HTTP error and names the file', async () => {
  const fake = (async () => new Response('gone', { status: 404 })) as unknown as typeof fetch
  await expect(downloadBytes('http://x/data/snap/v1/entities.parquet', { fetch: fake })).rejects.toThrow('snapshot download failed: v1/entities.parquet: HTTP 404')
})

test('downloadBytes fails a stalled body after the idle timeout instead of waiting forever', async () => {
  const fake = (async (_: unknown, init?: RequestInit) => {
    expect(init?.signal).toBeDefined()
    return new Response(streamOf([new Uint8Array([1]), new Uint8Array([2])], 1))
  }) as unknown as typeof fetch
  const started = performance.now()
  await expect(downloadBytes('http://x/data/snap/v1/attributes.parquet', { fetch: fake, idleMs: 30, totalMs: 5000 })).rejects.toThrow(/no data for 0.03s/)
  expect(performance.now() - started).toBeLessThan(1000)
})

test('downloadBytes fails a slow download after the total timeout and a hanging request when cancelled', async () => {
  const hang = ((_: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch
  await expect(downloadBytes('http://x/a/b.parquet', { fetch: hang, idleMs: 5000, totalMs: 30 })).rejects.toThrow(/not finished after 0.03s/)
  const controller = new AbortController()
  const pending = downloadBytes('http://x/a/b.parquet', { fetch: hang, signal: controller.signal })
  controller.abort()
  await expect(pending).rejects.toThrow(/cancelled/)
})

test('downloadBytes detects a truncated body', async () => {
  const fake = (async () => new Response(streamOf([new Uint8Array([1, 2])]), { headers: { 'content-length': '10' } })) as unknown as typeof fetch
  await expect(downloadBytes('http://x/a/b.parquet', { fetch: fake })).rejects.toThrow(/truncated \(2 of 10 bytes\)/)
})

test('ReadyGate resolves waiters on ready and resolves later calls at once', async () => {
  const gate = new ReadyGate()
  let done = false
  const waiting = gate.wait().then(() => { done = true })
  gate.update({ ready: false })
  await Promise.resolve()
  expect(done).toBe(false)
  gate.update({ ready: true })
  await waiting
  expect(done).toBe(true)
  await gate.wait()
})

test('ReadyGate rejects waiters when loading fails and when their signal aborts', async () => {
  const gate = new ReadyGate()
  const failing = gate.wait()
  gate.update({ ready: false, error: 'snapshot download failed: v1/entities.parquet: no data for 20s' })
  await expect(failing).rejects.toBeInstanceOf(IndexUnavailable)
  const controller = new AbortController()
  const cancelled = gate.wait(controller.signal)
  controller.abort()
  await expect(cancelled).rejects.toBeInstanceOf(QueryCancelled)
  await expect(gate.wait(controller.signal)).rejects.toBeInstanceOf(QueryCancelled)
})

const reader = (value: number) => ({
  schema: { fields: [{ name: 'n', type: { typeId: 2 } }] },
  async open() {},
  async *[Symbol.asyncIterator]() { yield { numRows: 1, getChildAt: () => ({ get: () => value }) } },
  async cancel() {},
})
const manifest = (version: number): Manifest => ({ chainId: 1, genesisHash: '0xabc', expression: '', version, snapshotBlock: version * 30, headBlock: version * 30,
  files: { entities: `snap/v${version}/entities.parquet`, attributes: `snap/v${version}/attributes.parquet` }, delta: 'delta.json' } as Manifest)

/** An IndexDb with fake DuckDB, RPC and clock. `fetch` is global, as in the browser. */
function fakeDb(extra: Record<string, unknown> = {}) {
  const statements: string[] = []
  const db = Object.assign(Object.create(IndexDb.prototype), {
    origin: 'http://fake', state: { status: 'loading' }, manifestAt: 0, loadedAt: 0, etag: null, queue: Promise.resolve(), gate: new ReadyGate(),
    now: () => 30 * MIN,
    rpc: { chainId: async () => 1, genesisHash: async () => '0xabc', blockNumber: async () => 999 },
    duck: { registerFileBuffer: async () => {}, dropFile: async () => null },
    connection: { query: async (sql: string) => { statements.push(sql) } },
    queries: { send: async () => reader(7), cancelSent: async () => {} },
    ...extra,
  })
  return { db: db as any, statements }
}

async function withFetch<T>(fake: (url: string) => Promise<Response>, body: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = (async (url: unknown) => fake(String(url))) as typeof fetch
  try { return await body() } finally { globalThis.fetch = original }
}

test('a query runs while a background snapshot download is stalled', async () => {
  // Loaded v1 with no live tail, so the newly published v2 is downloaded now.
  const { db, statements } = fakeDb({ state: { status: 'ready', manifest: manifest(1), chainOk: true, deltaTo: 40 } })
  db.gate.update({ ready: true })
  let release!: () => void
  const stalled = new Promise<void>(resolve => { release = resolve })
  await withFetch(async url => {
    if (url.endsWith('manifest.json')) return Response.json(manifest(2))
    if (url.endsWith('.parquet')) { await stalled; return new Response(new Uint8Array([1])) }
    return new Response(null, { status: 304 })
  }, async () => {
    const polling = db.poll(() => true)
    await Bun.sleep(5)
    const result = await Promise.race([db.run('SELECT 7'), Bun.sleep(500).then(() => 'blocked')])
    expect(result).toMatchObject({ rows: [[7]] })
    expect(statements).toEqual([])
    release()
    await polling
    expect(statements.some(sql => sql.includes("read_parquet('snap-v2-entities.parquet')"))).toBe(true)
  })
})

test('a newer snapshot is not downloaded while the loaded one is live tailed and young', async () => {
  const { db, statements } = fakeDb({ state: { status: 'ready', manifest: manifest(1), chainOk: true, deltaTo: 40 }, loadedAt: 29 * MIN, tail: { stop() {} } })
  const requested: string[] = []
  await withFetch(async url => { requested.push(url.replace('http://fake/data/', '')); return url.endsWith('manifest.json') ? Response.json(manifest(2)) : new Response(null, { status: 304 }) }, () => db.poll(() => true))
  // The v2 delta does not apply to v1, so neither it nor the parquet files are fetched.
  expect(requested).toEqual(['manifest.json'])
  expect(db.state.manifest.version).toBe(1)
  expect(statements).toEqual(['BEGIN TRANSACTION', 'DELETE FROM live_head', 'INSERT INTO live_head VALUES (999)', 'COMMIT'])
})

test('a failed background refresh keeps serving the loaded snapshot', async () => {
  const { db } = fakeDb({ state: { status: 'ready', manifest: manifest(1), chainOk: true, deltaTo: 40 }, loadedAt: 0, tail: { stop() {} } })
  const warn = console.warn
  console.warn = () => {}
  try {
    await withFetch(async url => url.endsWith('manifest.json') ? Response.json(manifest(9)) : url.endsWith('.parquet') ? new Response('gone', { status: 404 }) : new Response(null, { status: 304 }), () => db.poll(() => true))
  } finally { console.warn = warn }
  expect(db.state).toMatchObject({ status: 'ready', manifest: { version: 1 } })
})

test('run waits for the first snapshot and reports the wait', async () => {
  const { db } = fakeDb()
  const phases: string[] = []
  const pending = db.run('SELECT 7', 1000, { onWaiting: () => phases.push('waiting'), onRunning: () => phases.push('running') })
  await Bun.sleep(5)
  expect(phases).toEqual(['waiting'])
  db.gate.update({ ready: true })
  expect(await pending).toMatchObject({ rows: [[7]] })
  expect(phases).toEqual(['waiting', 'running'])
})

test('cancel settles a query that waits for the index, and a load failure fails it', async () => {
  const { db } = fakeDb()
  const controller = new AbortController()
  const cancelled = db.run('SELECT 7', 1000, { signal: controller.signal })
  controller.abort()
  await expect(cancelled).rejects.toBeInstanceOf(QueryCancelled)
  const failing = db.run('SELECT 7')
  db.gate.update({ ready: false, error: 'indexer unavailable (HTTP 502)' })
  await expect(failing).rejects.toThrow('indexer unavailable (HTTP 502)')
})

test('cancel settles a query queued behind other DuckDB work', async () => {
  let release!: () => void
  const { db } = fakeDb({ queue: new Promise<void>(resolve => { release = resolve }) })
  db.gate.update({ ready: true })
  const controller = new AbortController()
  const queued = db.run('SELECT 7', 1000, { signal: controller.signal })
  controller.abort()
  await expect(queued).rejects.toBeInstanceOf(QueryCancelled)
  release()
})
