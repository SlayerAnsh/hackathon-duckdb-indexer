import { test, expect, mock } from 'bun:test'
import { readFile, readdir } from 'node:fs/promises'
import { bootstrap, tick } from '../src/main'
import { loadConfig } from '../src/config'
import { temp, track, fake, hash, expression } from './helpers'
async function setup() {
  const config = loadConfig({ INDEX_EXPRESSION: expression, TIRAMISU_API_KEY: 'test', DATA_DIR: await temp() })
  const query = mock(async (_e, o) => ({ data: [], blockNumber: o.atBlock }))
  const rpc = fake(query), result = await bootstrap(config, rpc); track(result.store); query.mockClear()
  return { ...result, rpc, config, meta: { chainId: 7738577, genesisHash: hash, expression } }
}
test('tick below batch size does nothing', async () => { const ctx = await setup(); ctx.rpc.blockNumber = async () => 107; const logs = mock(async () => []); ctx.rpc.getLogs = logs; await tick(ctx); expect(logs).not.toHaveBeenCalled(); expect((await ctx.store.state())!.head_block).toBe(100) })
test('tick syncs and publishes delta', async () => { const ctx = await setup(); ctx.rpc.blockNumber = async () => 108; await tick(ctx); expect((await ctx.store.state())!.head_block).toBe(105); expect(JSON.parse(await readFile(ctx.dir + '/delta.json', 'utf8'))).toMatchObject({ fromBlock: 101, toBlock: 105 }) })
test('tick after interval snapshots and resets delta', async () => { const ctx = await setup(); ctx.rpc.blockNumber = async () => 133; await tick(ctx); expect((await ctx.store.state())!).toMatchObject({ snapshot_version: 2, snapshot_block: 130 }); expect(JSON.parse(await readFile(ctx.dir + '/delta.json', 'utf8'))).toMatchObject({ fromBlock: 131, toBlock: 130, entities: [] }) })
test('hash mismatch builds generation and switches only after publication', async () => { const ctx = await setup(), old = ctx.store, oldDir = ctx.dir; ctx.rpc.blockNumber = async () => 108; ctx.rpc.blockHash = async () => '0xnew'; await tick(ctx); track(ctx.store); expect(ctx.dir).toBe(oldDir + '-g1'); expect(ctx.store).not.toBe(old); expect((await ctx.store.state())!.head_hash).toBe('0xnew'); expect(JSON.parse(await readFile(ctx.dir + '/manifest.json', 'utf8')).snapshotBlock).toBe(105) })
test('header timeout preserves generation and checkpoint', async () => { const ctx = await setup(), old = ctx.store; ctx.rpc.blockNumber = async () => 108; ctx.rpc.blockHash = async () => { throw Error('timeout') }; await expect(tick(ctx)).rejects.toThrow('timeout'); expect(ctx.store).toBe(old); expect((await old.state())!.head_block).toBe(100) })
test('failed generation backfill preserves serving store', async () => { const ctx = await setup(), old = ctx.store, dir = ctx.dir; ctx.rpc.blockNumber = async () => 108; ctx.rpc.blockHash = async () => '0xnew'; ctx.rpc.query = async () => { throw Error('offline') }; await expect(tick(ctx)).rejects.toThrow('offline'); expect(ctx.store).toBe(old); expect(ctx.dir).toBe(dir) })
test('new generation uses a new snapshot version and survives restart', async () => {
  const ctx = await setup(); ctx.rpc.blockNumber = async () => 108; ctx.rpc.blockHash = async () => '0xnew'
  await tick(ctx); track(ctx.store)
  expect((await ctx.store.state())!.snapshot_version).toBe(2)
  ctx.store.close()
  const resumed = await bootstrap(ctx.config, ctx.rpc); track(resumed.store)
  expect(resumed.dir).toBe(ctx.dir); expect(resumed.head).toBe(105)
})
test('unavailable pinned state rebuilds without changing failed checkpoint', async () => {
  const ctx = await setup(), old = ctx.store
  ctx.rpc.blockNumber = async () => 108
  const { RpcError } = await import('@asi/core')
  const { row } = await import('./helpers')
  await old.upsert([row('0x' + '01'.repeat(32))], null)
  const { ENTITY_EVENTS_ABI, toEventSelector } = await import('@asi/core')
  ctx.rpc.getLogs = async () => [{ topics: [toEventSelector(ENTITY_EVENTS_ABI.find(e => e.name === 'EntityPatched')!), '0x' + '01'.repeat(32), '0x' + '00'.repeat(32)], data: '0x', blockNumber: 101, logIndex: 0, transactionHash: hash }]
  ctx.rpc.query = async (e, o) => { if (e.includes('$key')) throw new RpcError('unavailable', 200, -32006); return { data: [], blockNumber: o.atBlock! } }
  await tick(ctx); track(ctx.store)
  expect(ctx.store).not.toBe(old); expect(ctx.dir).toContain('-g1')
})
test('chain reset rebuild publishes refreshed genesis identity', async () => {
  const ctx = await setup(); ctx.rpc.blockNumber = async () => 108; ctx.rpc.blockHash = async () => '0xnew'
  ctx.rpc.genesisHash = async () => '0x' + 'ab'.repeat(32)
  await tick(ctx); track(ctx.store)
  const manifest = JSON.parse(await readFile(ctx.dir + '/manifest.json', 'utf8'))
  expect(manifest.genesisHash).toBe('0x' + 'ab'.repeat(32))
  expect(ctx.meta.genesisHash).toBe(manifest.genesisHash)
})
test('chain reset behind checkpoint still rebuilds', async () => {
  const ctx = await setup(); ctx.rpc.blockNumber = async () => 53; ctx.rpc.genesisHash = async () => '0x' + 'cd'.repeat(32)
  ctx.rpc.blockHash = async block => { if (block > 53) throw Error('Block hash unavailable'); return '0xnew' }
  await tick(ctx); track(ctx.store)
  expect((await ctx.store.state())!.head_block).toBe(50)
  expect(ctx.meta.genesisHash).toBe('0x' + 'cd'.repeat(32))
})
