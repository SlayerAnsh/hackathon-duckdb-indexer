import { test, expect, mock } from 'bun:test'
import { bootstrap } from '../src/main'
import { loadConfig } from '../src/config'
import { readManifest } from '../src/snapshot'
import { temp, track, raw, fake, expression, rows } from './helpers'
test('first run backfills and writes v1; second run resumes checkpoint without query', async () => {
  const config = loadConfig({ INDEX_EXPRESSION: expression, TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
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
  const config = loadConfig({ INDEX_EXPRESSION: '$owner = addr(0x1234)', TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
  const result = await bootstrap(config, fake(async () => ({ data: [], blockNumber: 100 })), log); track(result.store)
  expect(log.mock.calls.flat().join(' ')).toContain('$creator')
})
test('interrupted backfill can restart cleanly', async () => {
  const config = loadConfig({ INDEX_EXPRESSION: expression, TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
  await expect(bootstrap(config, fake(async (_e, opts) => {
    if (opts.cursor) throw Error('offline')
    return { data: [raw()], blockNumber: 100, cursor: 'next' }
  }))).rejects.toThrow('offline')
  const result = await bootstrap(config, fake(async () => ({ data: [], blockNumber: 100 }))); track(result.store)
  expect(await rows(result.store, 'SELECT * FROM entities')).toHaveLength(0)
})
test('missing snapshot after checkpoint is repaired without querying', async () => {
  const config = loadConfig({ INDEX_EXPRESSION: expression, TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
  const first = await bootstrap(config, fake(async () => ({ data: [], blockNumber: 100 })))
  const { rm } = await import('node:fs/promises')
  await rm(first.dir + '/manifest.json'); first.store.close()
  const query = mock(async () => { throw Error('should not query') })
  const result = await bootstrap(config, fake(query)); track(result.store)
  expect(await readManifest(result.dir)).not.toBeNull()
  expect(query).not.toHaveBeenCalled()
})
test('CLI configuration errors have no stack trace', async () => {
  const proc = Bun.spawn(['bun', 'apps/indexer/src/main.ts'], { env: { ...process.env, INDEX_EXPRESSION: '', TIRAMISU_API_KEY: '' }, stdout: 'pipe', stderr: 'pipe' })
  const stderr = await new Response(proc.stderr).text()
  expect(await proc.exited).toBe(1); expect(stderr).toContain('INDEX_EXPRESSION'); expect(stderr).not.toContain(' at ')
})
