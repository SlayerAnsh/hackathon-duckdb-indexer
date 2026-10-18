import { test, expect } from 'bun:test'
import { bootstrap, createClients, tick, type TickContext } from '../src/main'
import { createLock, fillTask } from '../src/fill'
import { loadConfig } from '../src/config'
import { temp, track, rows, hash, raw } from './helpers'
import { event } from './events'
const hex = (n: number) => '0x' + n.toString(16)
function fakeChain() {
  const chain = { head: 110, requests: [] as { headers: Headers; method: string }[] }
  const logs = [event(1, 'EntityCreated', 5, 100000), event(2, 'EntityCreated', 6, 100000), event(3, 'EntityCreated', 112, 100000), event(1, 'EntityPatched', 113)]
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    chain.requests.push({ headers: new Headers(init.headers), method: body.method })
    const [first] = body.params
    let result: unknown
    if (body.method === 'eth_chainId') result = hex(7738577)
    else if (body.method === 'eth_blockNumber') result = hex(chain.head)
    else if (body.method === 'eth_getBlockByNumber') result = { hash: first === '0x0' ? hash : '0x' + Number(first).toString(16).padStart(64, '0') }
    else if (body.method === 'eth_getLogs') result = logs.filter(l => l.blockNumber >= Number(first.fromBlock) && l.blockNumber <= Number(first.toBlock)).map(l => ({ ...l, blockNumber: hex(l.blockNumber), logIndex: hex(l.logIndex) }))
    else if (body.method === 'arkiv_query') result = { data: [...String(first).matchAll(/key\((0x[0-9a-f]+)\)/g)].map(m => ({ ...raw(m[1]), expiresAt: hex(100000), attributes: [{ name: 'type', type: 'str', value: 'x' }] })), blockNumber: body.params[1].atBlock }
    else throw Error('unexpected ' + body.method)
    return Response.json({ jsonrpc: '2.0', id: body.id, result })
  }) as unknown as typeof fetch
  return { chain, fetchImpl }
}
const keyed = (headers: Headers) => headers.has('authorization') || headers.has('x-api-key') || [...headers.values()].some(v => v.includes('secret'))

test('default config never sends the API key through bootstrap, ticks and fills', async () => {
  const { chain, fetchImpl } = fakeChain()
  const config = loadConfig({ TIRAMISU_API_KEY: 'secret', DATA_DIR: await temp() })
  const clients = createClients(config, fetchImpl)
  expect(clients.queryRpc).toBeUndefined()
  const result = await bootstrap(config, clients.rpc, () => {}, clients.queryRpc); track(result.store)
  const ctx: TickContext = { ...result, rpc: clients.rpc, queryRpc: clients.queryRpc, config, meta: { chainId: 7738577, genesisHash: hash, expression: '' } }
  const lock = createLock()
  const fill = fillTask({ rpc: clients.fillRpc, store: () => ctx.store, expression: '', chunk: 2, lock, log: () => {} })
  for (const head of [115, 120, 125]) {
    chain.head = head
    await lock(() => tick(ctx))
    await fill()
  }
  await fill(); await fill()
  expect((await ctx.store.state())!.head_block).toBe(122)
  expect(await rows(ctx.store, 'SELECT key FROM entities WHERE attrs_pending')).toEqual([])
  expect(await rows(ctx.store, 'SELECT count(*)::INTEGER AS n FROM attributes')).toEqual([{ n: 3 }])
  const methods = new Set(chain.requests.map(r => r.method))
  for (const method of ['eth_getLogs', 'eth_getBlockByNumber', 'arkiv_query']) expect(methods).toContain(method)
  expect(chain.requests.filter(r => keyed(r.headers))).toEqual([])
})
test('SYNC_USE_API_KEY restores the keyed sync client', async () => {
  const { chain, fetchImpl } = fakeChain()
  const clients = createClients(loadConfig({ TIRAMISU_API_KEY: 'secret', SYNC_USE_API_KEY: 'true' }), fetchImpl)
  await clients.rpc.blockNumber(); await clients.fillRpc.blockNumber(); await clients.queryRpc!.blockNumber()
  expect(chain.requests.map(r => r.headers.get('authorization'))).toEqual([null, null, 'Bearer secret'])
})
