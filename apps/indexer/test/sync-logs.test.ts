import { test, expect, mock } from 'bun:test'
import type { ArkivRpc } from '@asi/core'
import { syncLogs } from '../src/sync'
import { Store } from '../src/store'
import { temp, track, row, fake, rows, hash } from './helpers'
import { event, addr } from './events'
const key = (n: number) => '0x' + n.toString(16).padStart(64, '0')
async function setup(expression = '') {
  const s = track(await Store.open(await temp(), expression, 1, hash))
  await s.setState({ head_block: 100, head_hash: hash, snapshot_block: 100 })
  return s
}
function rpc(logs: ReturnType<typeof event>[]) {
  const r = fake(mock<ArkivRpc['query']>(async () => { throw Error('live sync must not query') }))
  const getLogs = mock<ArkivRpc['getLogs']>(async (from, to) => logs.filter(l => l.blockNumber >= from && l.blockNumber <= to))
  return { ...r, getLogs }
}
const entity = async (s: Store, k: string): Promise<Record<string, unknown> | undefined> => {
  const e = (await rows(s, `SELECT * FROM entities WHERE key = '${k}'`))[0]
  return e && { ...e, created_at: Number(e.created_at), updated_at: Number(e.updated_at), expires_at: Number(e.expires_at) }
}
const changes = async (s: Store) => (await rows(s, 'SELECT key, block, deleted FROM changes ORDER BY key, rowid')).map(r => [r.key, Number(r.block), r.deleted])
const withAttrs = (k: string, updated = 50, expires = 1000) => ({ ...row(k, expires), entity: { ...row(k, expires).entity, updated_at: updated } })

test('creation inserts a pending log row without any query', async () => {
  const s = await setup(), r = rpc([event(1, 'EntityCreated', 102, 900, { owner: addr(7), flags: 2 })])
  expect(await syncLogs(r, s, '', 101, 105)).toMatchObject({ created: 1 })
  expect(r.query).not.toHaveBeenCalled()
  expect(await entity(s, key(1))).toEqual({ key: key(1), owner: addr(7), creator: addr(7), created_at: 102, updated_at: 102, expires_at: 900, content_type: null, creation_flags: 2, attrs_pending: true })
  expect(await changes(s)).toEqual([[key(1), 105, false]])
  expect(await s.state()).toMatchObject({ head_block: 105, head_hash: hash })
})
test('patch keeps the row and attributes but marks it pending and moves it to the front of the fill queue', async () => {
  const s = await setup()
  await s.upsert([withAttrs(key(1))], null)
  await s.conn.run(`CREATE TABLE IF NOT EXISTS fill_misses(key VARCHAR PRIMARY KEY, misses INTEGER); INSERT INTO fill_misses VALUES ('${key(1)}', 3)`)
  await syncLogs(rpc([event(1, 'EntityPatched', 103)]), s, '', 101, 105)
  expect(await entity(s, key(1))).toMatchObject({ owner: '0x02', creator: '0x02', created_at: 1, updated_at: 103, expires_at: 1000, attrs_pending: true })
  expect(await rows(s, 'SELECT name, value FROM attributes')).toEqual([{ name: 'type', value: "ticket's" }])
  expect(await rows(s, 'SELECT * FROM fill_misses')).toEqual([])
  expect(await changes(s)).toEqual([[key(1), 105, false]])
})
test('expiry extension and transfer update the row in place and stay filled', async () => {
  const s = await setup()
  await s.upsert([withAttrs(key(1)), withAttrs(key(2))], null)
  await syncLogs(rpc([event(1, 'ExpiryExtended', 102, 5000), event(2, 'OwnershipTransferred', 104, 0, { newOwner: addr(9) })]), s, '', 101, 105)
  expect(await entity(s, key(1))).toMatchObject({ updated_at: 102, expires_at: 5000, attrs_pending: false })
  expect(await entity(s, key(2))).toMatchObject({ owner: addr(9), creator: '0x02', updated_at: 104, expires_at: 1000, attrs_pending: false })
  expect(await rows(s, 'SELECT count(*)::INTEGER AS n FROM attributes')).toEqual([{ n: 2 }])
  expect(await changes(s)).toEqual([[key(1), 105, false], [key(2), 105, false]])
})
test('transfer under a filter expression queues the key so the filler rechecks the filter', async () => {
  const expression = `$owner = addr(${addr(1)})`, s = await setup(expression)
  await s.upsert([withAttrs(key(1))], null)
  await syncLogs(rpc([event(1, 'OwnershipTransferred', 104, 0, { newOwner: addr(9) })]), s, expression, 101, 105)
  expect(await entity(s, key(1))).toMatchObject({ owner: addr(9), attrs_pending: true })
})
test('deletion removes the row with a tombstone; unknown keys are ignored', async () => {
  const s = await setup()
  await s.upsert([withAttrs(key(1))], null)
  await syncLogs(rpc([event(1, 'EntityDeleted', 102), event(5, 'EntityPatched', 102), event(6, 'EntityDeleted', 103), event(7, 'ExpiryExtended', 103, 900)]), s, '', 101, 105)
  expect(await rows(s, 'SELECT key FROM entities')).toEqual([])
  expect(await rows(s, 'SELECT key FROM attributes')).toEqual([])
  expect(await changes(s)).toEqual([[key(1), 105, true]])
})
test('events apply in block and log order within a batch', async () => {
  const s = await setup()
  const logs = [event(1, 'EntityDeleted', 104, 0, { logIndex: 0 }), event(1, 'EntityCreated', 102, 900, { logIndex: 5 }), event(1, 'EntityPatched', 103, 0, { logIndex: 1 }),
    event(2, 'ExpiryExtended', 104, 2000, { logIndex: 9 }), event(2, 'EntityCreated', 104, 900, { logIndex: 3 })]
  await syncLogs(rpc(logs), s, '', 101, 105)
  expect(await rows(s, 'SELECT key FROM entities')).toEqual([{ key: key(2) }])
  expect(await entity(s, key(2))).toMatchObject({ created_at: 104, updated_at: 104, expires_at: 2000, attrs_pending: true })
  const delta = (await rows(s, `SELECT deleted FROM changes WHERE key = '${key(1)}' ORDER BY rowid DESC LIMIT 1`))[0]
  expect(delta!.deleted).toBe(true)
})
test('creations by other owners are skipped under a creator filter', async () => {
  const expression = `$creator = addr(${addr(7)})`, s = await setup(expression)
  await syncLogs(rpc([event(1, 'EntityCreated', 102, 900, { owner: addr(7) }), event(2, 'EntityCreated', 102, 900, { owner: addr(8) })]), s, expression, 101, 105)
  expect(await rows(s, 'SELECT key FROM entities')).toEqual([{ key: key(1) }])
})
test('expiry sweep, log windows and capacity splitting stay as in keyed sync', async () => {
  const s = await setup()
  await s.upsert([withAttrs(key(1), 50, 105)], null)
  const r = rpc([])
  await syncLogs(r, s, '', 101, 2600)
  expect(r.getLogs.mock.calls).toEqual([[101, 1100], [1101, 2100], [2101, 2600]])
  expect(await changes(s)).toEqual([[key(1), 2600, true]])
  const { RpcError } = await import('@asi/core')
  const split = { ...r, getLogs: mock<ArkivRpc['getLogs']>(async (from, to) => { if (to - from >= 500) throw new RpcError('max results', 200, -32602); return [] }) }
  await syncLogs(split, s, '', 2601, 3600)
  expect(split.getLogs).toHaveBeenCalledTimes(3)
})
test('header change during the batch rolls everything back', async () => {
  const s = await setup(), r = rpc([event(1, 'EntityCreated', 102, 900)])
  let reads = 0; r.blockHash = async () => ++reads === 1 ? hash : '0xchanged'
  await expect(syncLogs(r, s, '', 101, 105)).rejects.toThrow('Canonical header changed')
  expect((await s.state())!.head_block).toBe(100)
  expect(await rows(s, 'SELECT * FROM entities')).toEqual([])
  expect(await rows(s, 'SELECT * FROM changes')).toEqual([])
})
