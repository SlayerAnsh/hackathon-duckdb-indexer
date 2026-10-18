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
  const proc = Bun.spawn(['bun', 'apps/indexer/src/main.ts'], { env: { ...process.env, SYNC_PAUSED: 'false', INDEX_EXPRESSION: '', TIRAMISU_API_KEY: '' }, stdout: 'pipe', stderr: 'pipe' })
  const stderr = await new Response(proc.stderr).text()
  expect(await proc.exited).toBe(1); expect(stderr).toContain('TIRAMISU_API_KEY'); expect(stderr).not.toContain(' at ')
})
test('logs bootstrap resumes fetched chunks at its original target after restart', async () => {
  const { event } = await import('./events')
  const config = loadConfig({ TIRAMISU_API_KEY: 'x', DATA_DIR: await temp() })
  const logs = fake(async () => { throw Error('public query') })
  const getLogs = mock(async () => Array.from({ length: 51 }, (_, n) => event(n + 1, 'EntityCreated', 1, 1000)))
  logs.getLogs = getLogs
  let calls = 0
  const query = fake(async (_text, opts) => {
    if (++calls === 2) throw Error('fetch failed')
    return { data: [raw()], blockNumber: opts.atBlock! }
  })
  await expect(bootstrap(config, logs, () => {}, query)).rejects.toThrow('fetch failed')
  logs.blockNumber = async () => 203
  query.query = mock(async (_text, opts) => {
    expect(opts.atBlock).toBe(100)
    return { data: [], blockNumber: opts.atBlock! }
  })
  const result = await bootstrap(config, logs, () => {}, query); track(result.store)
  expect(result.head).toBe(100)
  expect(getLogs).toHaveBeenCalledTimes(1)
  expect(query.query).toHaveBeenCalledTimes(1)
  expect((await result.store.indexedKeys()).size).toBe(1)
  expect(await rows(result.store, "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'replay_%'")).toHaveLength(0)
})
