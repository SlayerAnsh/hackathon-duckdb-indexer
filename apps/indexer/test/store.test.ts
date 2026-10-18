import { test, expect } from 'bun:test'
import { Store } from '../src/store'
import { loadConfig, storeDir } from '../src/config'
import { temp, track, row, rows, hash, expression } from './helpers'
test('config requires API key, supplies defaults', () => {
  expect(() => loadConfig({})).toThrow('TIRAMISU_API_KEY')
  expect(() => loadConfig({ INDEX_EXPRESSION: expression })).toThrow('TIRAMISU_API_KEY')
  expect(loadConfig({ INDEX_EXPRESSION: expression, TIRAMISU_API_KEY: 'secret' })).toMatchObject({ confirmations: 3, syncBatchBlocks: 5, snapshotIntervalBlocks: 30, keepSnapshots: 2, port: 8080, dataDir: './data' })
})
test('store identity directory', () => {
  expect(storeDir('/data', 7738577, hash)).toBe('/data/7738577-0x9548806311')
})
test('upsert replaces entity and all attributes; changes and removal', async () => {
  const s = track(await Store.open(await temp(), expression, 7738577, hash))
  expect(await s.state()).toBeNull()
  await s.upsert([row()], null)
  expect((await rows(s, 'SELECT * FROM entities'))[0]?.key).toBe('0x01')
  const next = row(); next.entity.updated_at = 5; next.attributes = []
  await s.upsert([next], 5)
  expect(Number((await rows(s, 'SELECT * FROM entities'))[0]?.updated_at)).toBe(5)
  expect(await rows(s, 'SELECT * FROM attributes')).toHaveLength(0)
  await s.remove(['0x01'], 6)
  expect(await s.indexedKeys()).toEqual(new Set())
  expect(await rows(s, 'SELECT * FROM changes ORDER BY block')).toMatchObject([{ key: '0x01', deleted: false }, { key: '0x01', deleted: true }])
})
test('expiry removes attributes, records tombstones and returns count', async () => {
  const s = track(await Store.open(await temp(), expression, 7738577, hash))
  await s.upsert([row('a', 99), row('b', 100), row('c', 101)], null)
  expect(await s.sweepExpired(100)).toBe(2)
  expect(await s.indexedKeys()).toEqual(new Set(['c']))
  expect(await rows(s, 'SELECT * FROM attributes')).toHaveLength(1)
  expect(await rows(s, 'SELECT * FROM changes')).toHaveLength(2)
})
test('expression mismatch names both expressions and path before backfill', async () => {
  const dir = await temp()
  const s = await Store.open(dir, expression, 7738577, hash); s.close()
  await expect(Store.open(dir, 'other', 7738577, hash)).rejects.toThrow(expression)
  await expect(Store.open(dir, 'other', 7738577, hash)).rejects.toThrow(dir)
})
test('state persists numbers and transaction rolls back', async () => {
  const dir = await temp(); const s = await Store.open(dir, expression, 7738577, hash)
  await s.setState({ start_block: 100, head_block: 100 })
  await expect(s.transaction(async () => { await s.upsert([row()], null); throw Error('rollback') })).rejects.toThrow('rollback')
  expect(await s.indexedKeys()).toEqual(new Set()); s.close()
  const reopened = track(await Store.open(dir, expression, 7738577, hash))
  expect(await reopened.state()).toMatchObject({ head_block: 100, start_block: 100, snapshot_version: 0 })
})
test('head_hash migration preserves extra sync_state columns', async () => {
  const dir = await temp(); const s = await Store.open(dir, expression, 7738577, hash)
  await s.setState({ start_block: 100, head_block: 100 })
  await s.conn.run("ALTER TABLE sync_state DROP COLUMN head_hash; ALTER TABLE sync_state ADD COLUMN extra VARCHAR DEFAULT 'kept'")
  s.close()
  const reopened = track(await Store.open(dir, expression, 7738577, hash))
  expect((await reopened.state())!.head_hash).toBeNull()
  await reopened.setState({ head_block: 105, head_hash: hash })
  expect(await reopened.state()).toMatchObject({ head_block: 105, head_hash: hash })
  expect((await rows(reopened, 'SELECT extra FROM sync_state'))[0]!.extra).toBe('kept')
})
test('store identity normalizes blank expressions', async () => {
  const dir = await temp(), s = await Store.open(dir, '  ', 1, hash)
  s.close()
  const reopened = track(await Store.open(dir, '', 1, hash))
  await reopened.setState({ head_block: 1 })
  expect((await reopened.state())!.expression).toBe('')
})
