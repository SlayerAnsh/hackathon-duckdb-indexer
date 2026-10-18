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
