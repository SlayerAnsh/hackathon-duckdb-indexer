import { test, expect, mock } from 'bun:test'
import { ROW_SELECT } from '@asi/core'
import { backfill } from '../src/backfill'
import { Store } from '../src/store'
import { temp, track, raw, fake, rows, hash, expression } from './helpers'
test('pages until no cursor, pinned block and no changes', async () => {
  const s = track(await Store.open(await temp(), expression, 1, hash))
  const query = mock(async (_expr, opts) => {
    const page = opts.cursor === 'a' ? 1 : opts.cursor === 'b' ? 2 : 0
    return { data: Array.from({ length: page === 2 ? 7 : 200 }, (_, n) => raw('0x' + (page * 200 + n).toString(16))), blockNumber: 100, cursor: ['a', 'b', undefined][page] }
  })
  expect(await backfill(fake(query), s, expression, 100)).toBe(407)
  expect(await s.indexedKeys()).toHaveProperty('size', 407)
  expect(query).toHaveBeenCalledTimes(3)
  for (let i = 0; i < 3; i++) expect(query.mock.calls[i]).toEqual([expression, { atBlock: 100, limit: 200, select: ROW_SELECT, cursor: [undefined, 'a', 'b'][i] }])
  expect(await rows(s, 'SELECT * FROM changes')).toHaveLength(0)
})
test('RPC failure preserves completed pages only', async () => {
  const s = track(await Store.open(await temp(), expression, 1, hash))
  const query = mock(async (_e, opts) => { if (opts.cursor) throw Error('unavailable'); return { data: [raw()], blockNumber: 100, cursor: 'next' } })
  await expect(backfill(fake(query), s, expression, 100)).rejects.toThrow('unavailable')
  expect((await s.indexedKeys()).size).toBe(1)
  expect(await s.state()).toBeNull()
})
test('invalid entity rolls back entire page', async () => {
  const s = track(await Store.open(await temp(), expression, 1, hash))
  await expect(backfill(fake(async () => ({ data: [raw(), {}], blockNumber: 100 })), s, expression, 100)).rejects.toThrow()
  expect((await s.indexedKeys()).size).toBe(0)
})
test('key backfill chunks 120 keys, pins rows and omits missing keys', async () => {
  const { backfillByKeys } = await import('../src/backfill')
  const keys = Array.from({ length: 120 }, (_, n) => '0x' + n.toString(16).padStart(64, '0'))
  const s = track(await Store.open(await temp(), '', 1, hash))
  const query = mock(async () => ({ data: [raw(keys[0])], blockNumber: 100 }))
  expect(await backfillByKeys(fake(query), s, '', keys, 100)).toBe(3)
  expect(query).toHaveBeenCalledTimes(3)
  for (const [text, opts] of query.mock.calls as any) {
    expect(text).toContain('$key = key(')
    expect(text).not.toContain('AND')
    expect(opts).toMatchObject({ atBlock: 100, select: ROW_SELECT })
  }
  expect((await s.indexedKeys()).size).toBe(1)
  expect(await rows(s, 'SELECT * FROM changes')).toHaveLength(0)
})
test('logs bootstrap uses public metadata and never queries rows', async () => {
  const { bootstrap } = await import('../src/main')
  const { loadConfig } = await import('../src/config')
  const { event } = await import('./events')
  const logs = fake(async () => { throw Error('public query forbidden') })
  logs.getLogs = async () => [event(1, 'EntityCreated', 1, 200)]
  const query = fake(mock(async () => { throw Error('private query forbidden') }))
  query.chainId = async () => { throw Error('private metadata forbidden') }
  const result = await bootstrap(loadConfig({ TIRAMISU_API_KEY: 'x', DATA_DIR: await temp() }), logs, () => {}, query)
  track(result.store)
  expect(query.query).not.toHaveBeenCalled()
  expect(await rows(result.store, 'SELECT key, attrs_pending FROM entities')).toEqual([{ key: '0x' + '1'.padStart(64, '0'), attrs_pending: true }])
})
