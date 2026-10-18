import { test, expect } from 'bun:test'
import { readdir, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { writeSnapshot, readManifest } from '../src/snapshot'
import { Store } from '../src/store'
import { temp, track, row, rows, hash, expression } from './helpers'
const meta = { chainId: 1, genesisHash: hash, expression }
test('versioned parquet filters expired entities and attributes; manifest is renamed last', async () => {
  const dir = await temp(), s = track(await Store.open(dir, expression, 1, hash))
  expect(await readManifest(dir)).toBeNull()
  await s.upsert([row('expired', 100), row('live', 101)], 100)
  const m = await writeSnapshot(s, dir, 100, meta, 2)
  expect(m).toEqual({ ...meta, version: 1, snapshotBlock: 100, headBlock: 100, files: { entities: 'snap/v1/entities.parquet', attributes: 'snap/v1/attributes.parquet' }, delta: 'delta.json', live: 1, pending: 0 })
  for (const file of Object.values(m.files)) expect(await rows(s, "SELECT key FROM read_parquet('" + join(dir, file) + "')")).toEqual([{ key: 'live' }])
  expect(await readManifest(dir)).toEqual(m)
  expect(await readdir(dir)).not.toContain('manifest.json.tmp')
})
test('increments versions, prunes and truncates changes through head', async () => {
  const dir = await temp(), s = track(await Store.open(dir, expression, 1, hash))
  await s.upsert([row()], 100); await s.upsert([row()], 105)
  for (let i = 0; i < 4; i++) await writeSnapshot(s, dir, 100, meta, 2)
  expect((await readdir(join(dir, 'snap'))).sort()).toEqual(['v3', 'v4'])
  expect(await rows(s, 'SELECT * FROM changes')).toHaveLength(1)
  expect(await s.state()).toMatchObject({ snapshot_version: 4, snapshot_block: 100 })
})
test('failed publication preserves previous manifest and snapshot', async () => {
  const dir = await temp(), s = track(await Store.open(dir, expression, 1, hash))
  const first = await writeSnapshot(s, dir, 100, meta, 1)
  await mkdir(join(dir, 'manifest.json.tmp'))
  await expect(writeSnapshot(s, dir, 101, meta, 1)).rejects.toThrow()
  expect(await readManifest(dir)).toEqual(first)
  expect((await readFile(join(dir, first.files.entities))).length).toBeGreaterThan(0)
  expect(await s.state()).toMatchObject({ snapshot_version: 1 })
})
test('failed snapshot retains replay keys and fetched progress until publication succeeds', async () => {
  const { replayLiveKeys } = await import('../src/replay')
  const { backfillByKeys } = await import('../src/backfill')
  const { fake } = await import('./helpers')
  const { event } = await import('./events')
  const dir = await temp(), s = track(await Store.open(dir, expression, 1, hash))
  const rpc = fake(async () => ({ data: [], blockNumber: 100 }))
  rpc.getLogs = async () => [event(1, 'EntityCreated', 1, 200)]
  const keys = await replayLiveKeys(rpc, s, 100)
  await backfillByKeys(rpc, s, expression, keys, 100)
  await mkdir(join(dir, 'manifest.json.tmp'))
  await expect(writeSnapshot(s, dir, 100, meta, 1)).rejects.toThrow()
  expect(await rows(s, 'SELECT * FROM replay_live')).toHaveLength(1)
  expect(await rows(s, 'SELECT * FROM replay_fetched')).toHaveLength(1)
  const { rm } = await import('node:fs/promises')
  await rm(join(dir, 'manifest.json.tmp'), { recursive: true })
  await writeSnapshot(s, dir, 100, meta, 1)
  expect(await rows(s, "SELECT 1 FROM information_schema.tables WHERE table_name LIKE 'replay_%'")).toHaveLength(0)
})
