import { test, expect, mock } from 'bun:test'
import { RpcError, type RpcEntity } from '@asi/core'
import { createLock, fillPending, fillTask, createFillRpc } from '../src/fill'
import { loadConfig } from '../src/config'
import { Store } from '../src/store'
import { temp, track, fake, rows, hash, raw } from './helpers'
const key = (n: number) => '0x' + n.toString(16).padStart(64, '0')
async function pendingStore(count: number, dir?: string) {
  const s = track(await Store.open(dir ?? await temp(), '', 1, hash))
  await s.setState({ start_block: 100, head_block: 100, snapshot_block: 100 })
  for (let n = 1; n <= count; n++) await s.conn.run(`INSERT INTO entities VALUES ('${key(n)}', '0x02', '0x02', ${n}, ${n * 10}, 1000, NULL, 0, true)`)
  return s
}
const returned = (keys: string[]) => keys.map(k => ({ ...raw(k), expiresAt: '0x3e8', attributes: [{ name: 'type', type: 'str', value: 'x' }] }) as RpcEntity)
const keysIn = (text: string) => [...text.matchAll(/key\((0x[0-9a-f]+)\)/g)].map(m => m[1]!)

test('fills newest pending keys first at head with change rows', async () => {
  const s = await pendingStore(5)
  const query = mock(async (text: string, opts: any) => ({ data: returned(keysIn(text)), blockNumber: opts.atBlock }))
  expect(await fillPending(fake(query), s, '', { chunk: 2 })).toEqual({ fetched: 2, dropped: 0 })
  expect(keysIn(query.mock.calls[0]![0])).toEqual([key(5), key(4)])
  expect(query.mock.calls[0]![1]).toMatchObject({ atBlock: 100 })
  expect(query.mock.calls[0]![0]).not.toContain('AND')
  expect(await rows(s, 'SELECT key FROM entities WHERE attrs_pending ORDER BY key')).toEqual([{ key: key(1) }, { key: key(2) }, { key: key(3) }])
  expect(await rows(s, 'SELECT count(*)::INTEGER AS n FROM attributes')).toEqual([{ n: 2 }])
  expect((await rows(s, 'SELECT key, block FROM changes ORDER BY key')).map(r => [r.key, Number(r.block)])).toEqual([[key(4), 101], [key(5), 101]])
})
test('restart resumes with the next unfetched newest keys', async () => {
  const dir = await temp(), s = await pendingStore(4, dir)
  const query = mock(async (text: string, opts: any) => ({ data: returned(keysIn(text)), blockNumber: opts.atBlock }))
  await fillPending(fake(query), s, '', { chunk: 2 })
  s.close()
  const reopened = track(await Store.open(dir, '', 1, hash))
  await fillPending(fake(query), reopened, '', { chunk: 2 })
  expect(keysIn(query.mock.calls[1]![0])).toEqual([key(2), key(1)])
  expect(await rows(reopened, 'SELECT key FROM entities WHERE attrs_pending')).toEqual([])
})
test('429 records pausedUntil and leaves keys pending', async () => {
  const s = await pendingStore(2)
  const rpc = fake(async () => { throw new RpcError('limited', 429, 'ANON_COST_LIMITED', '3600') })
  expect(await fillPending(rpc, s, '', { now: () => 1000 })).toEqual({ fetched: 0, dropped: 0, pausedUntil: 1000 + 3600000 })
  expect(await rows(s, 'SELECT key FROM entities WHERE attrs_pending')).toHaveLength(2)
})
test('expired keys not returned are dropped; live misses stay pending and move back', async () => {
  const s = await pendingStore(3)
  await s.conn.run(`UPDATE entities SET expires_at = 100 WHERE key = '${key(3)}'`)
  const query = mock(async (_text: string, opts: any) => ({ data: [], blockNumber: opts.atBlock }))
  expect(await fillPending(fake(query), s, '', { chunk: 2 })).toEqual({ fetched: 0, dropped: 1 })
  expect(await rows(s, `SELECT key FROM entities WHERE key = '${key(3)}'`)).toEqual([])
  expect((await rows(s, 'SELECT key, deleted FROM changes'))).toEqual([{ key: key(3), deleted: true }])
  await fillPending(fake(query), s, '', { chunk: 2 })
  expect(keysIn(query.mock.calls[1]![0])).toEqual([key(1), key(2)])
  expect(await rows(s, 'SELECT key FROM entities WHERE attrs_pending ORDER BY key')).toEqual([{ key: key(1) }, { key: key(2) }])
})
test('keys fetched or deleted by live sync during the query are not overwritten', async () => {
  const s = await pendingStore(2)
  const { row } = await import('./helpers')
  const lock = createLock()
  const query = mock(async (text: string, opts: any) => {
    await lock(async () => {
      await s.upsert([{ ...row(key(2), 1000), entity: { ...row(key(2), 1000).entity, updated_at: 104 } }], 104)
      await s.remove([key(1)], 104)
      await s.setState({ head_block: 104 })
    })
    return { data: returned(keysIn(text)), blockNumber: opts.atBlock }
  })
  expect(await fillPending(fake(query), s, '', { lock })).toEqual({ fetched: 0, dropped: 0 })
  expect((await rows(s, 'SELECT key, updated_at FROM entities')).map(r => [r.key, Number(r.updated_at)])).toEqual([[key(2), 104]])
})
test('non empty expression drops keys that do not match', async () => {
  const s = track(await Store.open(await temp(), '$creator = addr(0x1234)', 1, hash))
  await s.setState({ head_block: 100, snapshot_block: 90 })
  await s.conn.run(`INSERT INTO entities VALUES ('${key(1)}', '0x02', '0x02', 1, 10, 1000, NULL, 0, true)`)
  const query = mock(async (_text: string, opts: any) => ({ data: [], blockNumber: opts.atBlock }))
  expect(await fillPending(fake(query), s, '$creator = addr(0x1234)')).toEqual({ fetched: 0, dropped: 1 })
  expect(query.mock.calls[0]![0]).toStartWith('($creator = addr(0x1234)) AND')
  expect((await rows(s, 'SELECT block FROM changes')).map(r => Number(r.block))).toEqual([100])
})
test('task logs a pause once, skips until it ends, then publishes fills', async () => {
  const s = await pendingStore(1), log = mock((_: string) => {}), publish = mock(async () => {})
  let now = 0, limited = true
  const rpc = fake(mock(async (text: string, opts: any) => {
    if (limited) throw new RpcError('limited', 429, 'ANON_COST_LIMITED', '10')
    return { data: returned(keysIn(text)), blockNumber: opts.atBlock }
  }))
  const run = fillTask({ rpc, store: () => s, expression: '', chunk: 50, lock: createLock(), log, now: () => now, publish })
  await run(); await run(); now = 5000; await run()
  expect(rpc.query).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalledTimes(1)
  expect(log.mock.calls[0]![0]).toContain('paused')
  limited = false; now = 10000; await run()
  expect(rpc.query).toHaveBeenCalledTimes(2)
  expect(publish).toHaveBeenCalledTimes(1)
})
test('fill client sends no API key unless FILL_USE_API_KEY is true', async () => {
  for (const use of [false, true]) {
    const headers: (string | null)[] = []
    const fetchImpl = (async (_url: string, init: RequestInit) => { headers.push(new Headers(init.headers).get('authorization')); return Response.json({ jsonrpc: '2.0', id: 1, result: '0x1' }) }) as unknown as typeof fetch
    const config = loadConfig({ TIRAMISU_API_KEY: 'secret', FILL_USE_API_KEY: String(use) })
    await createFillRpc(config, fetchImpl).blockNumber()
    expect(headers).toEqual([use ? 'Bearer secret' : null])
  }
})
test('a patched key re-fetched by the filler replaces its stale attributes', async () => {
  const s = await pendingStore(0)
  const { row } = await import('./helpers')
  const old = row(key(1), 1000)
  await s.upsert([{ entity: { ...old.entity, updated_at: 90 }, attributes: [...old.attributes, { key: key(1), name: 'gone', type: 'str', value: 'y', num: null }] }], null)
  await s.conn.run(`UPDATE entities SET attrs_pending = true, updated_at = 95 WHERE key = '${key(1)}'`)
  const query = mock(async (text: string, opts: any) => ({ data: returned(keysIn(text)), blockNumber: opts.atBlock }))
  expect(await fillPending(fake(query), s, '')).toEqual({ fetched: 1, dropped: 0 })
  expect(await rows(s, 'SELECT name, value FROM attributes')).toEqual([{ name: 'type', value: 'x' }])
  expect(await rows(s, 'SELECT attrs_pending FROM entities')).toEqual([{ attrs_pending: false }])
})
test('a key patched again while its fill query is in flight stays pending and is fetched again later', async () => {
  const s = await pendingStore(1)
  await s.setState({ head_hash: hash })
  const { syncLogs } = await import('../src/sync')
  const { event } = await import('./events')
  const lock = createLock()
  const chain = fake(async () => { throw Error('sync must not query') })
  chain.getLogs = async () => [event(1, 'EntityPatched', 103)]
  let calls = 0
  const query = mock(async (text: string, opts: any) => {
    // The RPC answers for the picked block, then live sync applies a newer patch before the fill writes.
    if (++calls === 1) await lock(() => syncLogs(chain, s, '', 101, 105))
    return { data: returned(keysIn(text)).map(e => ({ ...e, updatedAt: '0x' + opts.atBlock.toString(16), attributes: [{ name: 'type', type: 'str', value: 'at ' + opts.atBlock }] }) as RpcEntity), blockNumber: opts.atBlock }
  })
  expect(await fillPending(fake(query), s, '', { lock })).toEqual({ fetched: 0, dropped: 0 })
  expect(query.mock.calls[0]![1]).toMatchObject({ atBlock: 100 })
  expect((await rows(s, 'SELECT attrs_pending, updated_at FROM entities')).map(r => [r.attrs_pending, Number(r.updated_at)])).toEqual([[true, 103]])
  expect(await rows(s, 'SELECT * FROM attributes')).toEqual([])
  expect(await fillPending(fake(query), s, '', { lock })).toEqual({ fetched: 1, dropped: 0 })
  expect(query.mock.calls[1]![1]).toMatchObject({ atBlock: 105 })
  expect(await rows(s, 'SELECT value FROM attributes')).toEqual([{ value: 'at 105' }])
  expect(await rows(s, 'SELECT attrs_pending FROM entities')).toEqual([{ attrs_pending: false }])
})
