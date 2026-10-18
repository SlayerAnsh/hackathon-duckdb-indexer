import { test, expect, mock } from 'bun:test'
import { bootstrap } from '../src/main'
import { loadConfig } from '../src/config'
import { readManifest } from '../src/snapshot'
import { temp, track, raw, fake, expression, rows } from './helpers'
test('first run backfills and writes v1; second run resumes checkpoint without query', async () => {
  const config = loadConfig({ BACKFILL_MODE: 'query', INDEX_EXPRESSION: expression, TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
  const query = mock(async () => ({ data: [raw()], blockNumber: 100 }))
  const first = await bootstrap(config, fake(query)); expect(first.head).toBe(100)
  expect(await first.store.state()).toMatchObject({ start_block: 100, head_block: 100, snapshot_version: 1 })
  expect((await readManifest(first.dir))?.version).toBe(1)
  first.store.close()
  query.mockClear()
  const second = await bootstrap(config, fake(query)); track(second.store)
  expect(query).not.toHaveBeenCalled(); expect(second.head).toBe(100)
  expect((await readManifest(second.dir))?.version).toBe(1)
})
test('warns without creator term', async () => {
  const log = mock(() => {})
  const config = loadConfig({ BACKFILL_MODE: 'query', INDEX_EXPRESSION: '$owner = addr(0x1234)', TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
  const result = await bootstrap(config, fake(async () => ({ data: [], blockNumber: 100 })), log); track(result.store)
  expect(log.mock.calls.flat().join(' ')).toContain('$creator')
})
test('interrupted backfill can restart cleanly', async () => {
  const config = loadConfig({ BACKFILL_MODE: 'query', INDEX_EXPRESSION: expression, TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
  await expect(bootstrap(config, fake(async (_e, opts) => {
    if (opts.cursor) throw Error('offline')
    return { data: [raw()], blockNumber: 100, cursor: 'next' }
  }))).rejects.toThrow('offline')
  const result = await bootstrap(config, fake(async () => ({ data: [], blockNumber: 100 }))); track(result.store)
  expect(await rows(result.store, 'SELECT * FROM entities')).toHaveLength(0)
})
test('missing snapshot after checkpoint is repaired without querying', async () => {
  const config = loadConfig({ BACKFILL_MODE: 'query', INDEX_EXPRESSION: expression, TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
  const first = await bootstrap(config, fake(async () => ({ data: [], blockNumber: 100 })))
  const { rm } = await import('node:fs/promises')
  await rm(first.dir + '/manifest.json'); first.store.close()
  const query = mock(async () => { throw Error('should not query') })
  const result = await bootstrap(config, fake(query)); track(result.store)
  expect(await readManifest(result.dir)).not.toBeNull()
  expect(query).not.toHaveBeenCalled()
})
test('CLI configuration errors have no stack trace', async () => {
  const proc = Bun.spawn(['bun', 'apps/indexer/src/main.ts'], { env: { ...process.env, SYNC_PAUSED: 'false', BACKFILL_MODE: 'query', INDEX_EXPRESSION: '', TIRAMISU_API_KEY: '' }, stdout: 'pipe', stderr: 'pipe' })
  const stderr = await new Response(proc.stderr).text()
  expect(await proc.exited).toBe(1); expect(stderr).toContain('BACKFILL_MODE=query requires TIRAMISU_API_KEY'); expect(stderr).not.toContain(' at ')
})
test('logs bootstrap reuses the replay, keeps fetched rows and publishes pending rows without queries', async () => {
  const { event } = await import('./events')
  const config = loadConfig({ TIRAMISU_API_KEY: 'x', DATA_DIR: await temp() })
  const logs = fake(async () => { throw Error('public query') })
  let crash = true
  const getLogs = mock(async () => { if (crash) { crash = false; throw Error('replay failed') } return Array.from({ length: 3 }, (_, n) => event(n + 1, 'EntityCreated', n + 1, 1000)) })
  logs.getLogs = getLogs
  const query = fake(mock(async () => { throw Error('bootstrap must not query') }))
  await expect(bootstrap(config, logs, () => {}, query)).rejects.toThrow('replay failed')
  logs.blockNumber = async () => 203
  const result = await bootstrap(config, logs, () => {}, query); track(result.store)
  expect(result.head).toBe(100)
  expect(query.query).not.toHaveBeenCalled()
  const manifest = (await readManifest(result.dir))!
  expect(manifest).toMatchObject({ live: 3, pending: 3, snapshotBlock: 100 })
  const parquet = await rows(result.store, "SELECT key, attrs_pending, created_at FROM read_parquet('" + result.dir + '/' + manifest.files.entities + "') ORDER BY key")
  expect(parquet.map(r => [r.attrs_pending, Number(r.created_at)])).toEqual([[true, 1], [true, 2], [true, 3]])
  expect(await rows(result.store, "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'replay_%'")).toHaveLength(0)
})
test('after one fill the delta and manifest carry the filled rows', async () => {
  const { event } = await import('./events')
  const { fillPending } = await import('../src/fill')
  const { publishFill } = await import('../src/main')
  const config = loadConfig({ TIRAMISU_API_KEY: 'x', DATA_DIR: await temp() })
  const logs = fake(async () => { throw Error('public query') })
  logs.getLogs = async () => Array.from({ length: 3 }, (_, n) => event(n + 1, 'EntityCreated', n + 1, 1000))
  const result = await bootstrap(config, logs, () => {}, logs); track(result.store)
  const filler = fake(async (text, opts) => ({ data: [...text.matchAll(/key\((0x[0-9a-f]+)\)/g)].slice(0, 1).map(m => raw(m[1])), blockNumber: opts.atBlock! }))
  expect(await fillPending(filler, result.store, '', { chunk: 1 })).toEqual({ fetched: 1, dropped: 0 })
  await publishFill(result.store, result.dir)
  const { readFile } = await import('node:fs/promises')
  const delta = JSON.parse(await readFile(result.dir + '/delta.json', 'utf8'))
  expect(delta.entities).toHaveLength(1)
  expect(delta.entities[0]).toMatchObject({ key: '0x' + '3'.padStart(64, '0'), attrs_pending: false })
  expect(delta.fromBlock).toBe(101)
  expect(await readManifest(result.dir)).toMatchObject({ version: 1, live: 3, pending: 2 })
})
