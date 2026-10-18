import { test, expect, mock } from 'bun:test'
import { ENTITY_EVENTS_ABI, toEventSelector } from '@asi/core'
import { RpcError, type ArkivRpc } from '@asi/core'
import { syncBatch, touchedFromLogs } from '../src/sync'
import { Store } from '../src/store'
import { temp, track, row, raw, fake, rows, hash } from './helpers'
const owner = '0x6cb41094b6ae370454c2c34cf91cf02e768a5e22'
const expression = `$creator = addr(${owner})`
const key = (n: number) => '0x' + n.toString(16).padStart(64, '0')
const log = (k: string, created = false, who = owner) => ({ topics: [toEventSelector(ENTITY_EVENTS_ABI.find(e => e.name === (created ? 'EntityCreated' : 'EntityPatched'))!), k, '0x' + who.slice(2).padStart(64, '0')], data: '0x' + '0'.repeat(128), blockNumber: 101, logIndex: 0, transactionHash: hash })
async function setup() { const s = track(await Store.open(await temp(), expression, 1, hash)); await s.setState({ head_block: 100 }); return s }
function rpc(logs = [log(key(1))], data = [raw(key(1))]) { const query = mock<ArkivRpc['query']>(async () => ({ data, blockNumber: 105 })); return { ...fake(query), blockHash: async () => hash, getLogs: mock<ArkivRpc['getLogs']>(async () => logs), query } }
test('topics normalize unique keys and creation owner', () => { const l = log(key(171), true); l.topics = l.topics.map(t => '0x' + t.slice(2).toUpperCase()); expect(touchedFromLogs([l, log(key(171))])).toEqual({ keys: [key(171)], createdBy: new Map([[key(171), owner]]) }) })
test('queries indexed key but excludes unrelated creation at pinned block', async () => { const s = await setup(); await s.upsert([row(key(1))], null); const r = rpc([log(key(1)), log(key(2), true, '0x' + '11'.repeat(20))]); await syncBatch(r, s, expression, 101, 105); expect(r.query).toHaveBeenCalledTimes(1); expect(r.query.mock.calls[0]![0]).toContain(key(1)); expect(r.query.mock.calls[0]![0]).not.toContain(key(2)); expect(r.query.mock.calls[0]![1].atBlock).toBe(105) })
test('new matching creation is queried', async () => { const s = await setup(), r = rpc([log(key(1), true)]); await syncBatch(r, s, expression, 101, 105); expect(r.query).toHaveBeenCalledTimes(1) })
test('no owner terms queries all touched keys', async () => { const s = await setup(), r = rpc(); await syncBatch(r, s, 'type = str(\'x\')', 101, 105); expect(r.query).toHaveBeenCalledTimes(1) })
test('missing indexed key removed with tombstone', async () => { const s = await setup(); await s.upsert([row(key(1))], null); await syncBatch(rpc(undefined, []), s, expression, 101, 105); expect(await s.indexedKeys()).toEqual(new Set()); expect(await rows(s, 'SELECT * FROM changes')).toMatchObject([{ key: key(1), deleted: true }]) })
test('new absent key ignored', async () => { const s = await setup(); await syncBatch(rpc([log(key(1), true)], []), s, expression, 101, 105); expect(await rows(s, 'SELECT * FROM changes')).toEqual([]) })
test('120 relevant keys make 3 queries', async () => { const s = await setup(), r = rpc(Array.from({ length: 120 }, (_, n) => log(key(n), true)), []); await syncBatch(r, s, expression, 101, 105); expect(r.query).toHaveBeenCalledTimes(3) })
test('2500 blocks use three windows', async () => { const s = await setup(), r = rpc([], []); await syncBatch(r, s, expression, 101, 2600); expect(r.getLogs.mock.calls).toEqual([[101, 1100], [1101, 2100], [2101, 2600]]) })
test('capacity errors split, other errors propagate', async () => { const s = await setup(), r = rpc([], []); r.getLogs = mock(async (from, to) => { if (to - from >= 500) throw new RpcError('max results', 200, -32602); return [] }); await syncBatch(r, s, expression, 101, 1100); expect(r.getLogs).toHaveBeenCalledTimes(3); r.getLogs = mock(async () => { throw Error('offline') }); await expect(syncBatch(r, s, expression, 1101, 1200)).rejects.toThrow('offline') })
test('unavailable block preserves checkpoint and rows', async () => { const s = await setup(); await s.upsert([row(key(1))], null); const r = rpc(); r.query = mock(async () => { throw new RpcError('unavailable', 200, -32006) }); await expect(syncBatch(r, s, expression, 101, 105)).rejects.toThrow('unavailable'); expect((await s.state())!.head_block).toBe(100); expect((await s.indexedKeys()).size).toBe(1) })
test('empty relevant batch advances checkpoint and sweeps expiry', async () => { const s = await setup(); await s.upsert([row(key(1), 105)], null); const r = rpc([], []); await syncBatch(r, s, expression, 101, 105); expect(r.query).not.toHaveBeenCalled(); expect(await s.state()).toMatchObject({ head_block: 105, head_hash: hash }); expect(await rows(s, 'SELECT * FROM changes')).toMatchObject([{ key: key(1), deleted: true }]) })
test('header changing during staged reads rolls back batch', async () => {
  const s = await setup(); await s.upsert([row(key(1))], null)
  const r = rpc(); let reads = 0; r.blockHash = async () => ++reads === 1 ? hash : '0xchanged'
  await expect(syncBatch(r, s, expression, 101, 105)).rejects.toThrow('Canonical header changed')
  expect((await s.state())!.head_block).toBe(100)
  expect(await rows(s, 'SELECT * FROM changes')).toEqual([])
})
