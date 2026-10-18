import { test, expect, mock } from 'bun:test'
import { RpcError } from '@asi/core'
import { fetchLogsAdaptive, replayLiveKeys } from '../src/replay'
import { Store } from '../src/store'
import { fake, temp, track, hash, rows } from './helpers'
import { event } from './events'
const key = (n: number) => '0x' + n.toString(16).padStart(64, '0')
test('replay lifecycle, ordering, duplicate delivery and expiry without event', async () => {
  const s = track(await Store.open(await temp(), '', 1, hash)), rpc = fake(async () => { throw Error('query') })
  rpc.getLogs = async () => [event(1, 'EntityCreated', 1, 5), event(1, 'ExpiryExtended', 2, 10), event(2, 'EntityCreated', 1), event(2, 'EntityDeleted', 2), event(3, 'EntityCreated', 3), event(4, 'EntityCreated', 1, 5), event(4, 'ExpiryExtended', 2, 50), event(4, 'EntityPatched', 3), event(5, 'EntityPatched', 4), event(3, 'EntityCreated', 3)]
  expect(await replayLiveKeys(rpc, s, 10)).toEqual([key(3), key(4)])
  expect(await rows(s, 'SELECT * FROM replay_live')).toHaveLength(2)
})
test('adaptive suggested range, halving and rate limit', async () => {
  for (const suggested of [true, false]) {
    const rpc = fake(async () => { throw Error() }), calls: number[][] = [], windows: number[][] = []
    rpc.getLogs = async (a,b) => { calls.push([a,b]); if(calls.length === 1) throw new RpcError('query exceeds max results 20000' + (suggested ? ', retry with the range 0-3' : ''), 200, -32602); return [] }
    await fetchLogsAdaptive(rpc, 0, 9, async (_l,a,b) => { windows.push([a,b]) })
    expect(calls[1]).toEqual([0, suggested ? 3 : 4])
    expect(windows[1]![0]).toBe(suggested ? 4 : 5)
    expect(windows.at(-1)![1]).toBe(9)
  }
  const rpc = fake(async () => { throw Error() }), sleep = mock(async () => {})
  let attempts = 0
  rpc.getLogs = async () => { if (!attempts++) throw new RpcError('limited', 429, 429, '2'); return [] }
  await fetchLogsAdaptive(rpc, 0, 1, async () => {}, { sleep })
  expect(sleep).toHaveBeenCalledWith(2000)
})
test('restart resumes third window after failure without duplicate events', async () => {
  const dir = await temp(), s = await Store.open(dir, '', 1, hash), rpc = fake(async () => { throw Error() })
  rpc.getLogs = async (a) => { if(a === 40000) throw Error('crash'); return [event(1, 'EntityCreated', 1, 90000)] }
  await expect(replayLiveKeys(rpc, s, 79999)).rejects.toThrow('crash')
  expect(await rows(s, 'SELECT * FROM replay_events')).toHaveLength(1)
  s.close()
  const reopened = track(await Store.open(dir, '', 1, hash)), calls: number[] = []
  rpc.getLogs = async a => { calls.push(a); return [] }
  expect(await replayLiveKeys(rpc, reopened, 79999)).toEqual([key(1)])
  expect(calls).toEqual([40000,60000])
})
test('unrelated errors do not commit a window', async () => {
  const rpc = fake(async () => { throw Error() }), commit = mock(async () => {})
  rpc.getLogs = async () => { throw new RpcError('invalid parameter', 200, -32602) }
  await expect(fetchLogsAdaptive(rpc, 0, 9, commit)).rejects.toThrow('invalid parameter')
  expect(commit).not.toHaveBeenCalled()
})

test('permanent replay expiry is clamped and completed live keys are reused', async () => {
  const s = track(await Store.open(await temp(), '', 1, hash)), rpc = fake(async () => { throw Error('query') })
  rpc.getLogs = async () => [event(1, 'EntityCreated', 1, 0xffffffffffffffffn)]
  expect(await replayLiveKeys(rpc, s, 10)).toEqual([key(1)])
  expect(Number((await rows(s, 'SELECT expires_at FROM replay_events'))[0]!.expires_at)).toBe(Number.MAX_SAFE_INTEGER)
  rpc.getLogs = async () => { throw Error('must reuse replay') }
  expect(await replayLiveKeys(rpc, s, 10)).toEqual([key(1)])
})
test('a different replay target discards cached keys and fetch progress', async () => {
  const s = track(await Store.open(await temp(), '', 1, hash)), rpc = fake(async () => { throw Error('query') })
  rpc.getLogs = async () => [event(1, 'EntityCreated', 1, 15)]
  expect(await replayLiveKeys(rpc, s, 10)).toEqual([key(1)])
  await s.conn.run("CREATE TABLE replay_fetched(key VARCHAR PRIMARY KEY); INSERT INTO replay_fetched VALUES ('old')")
  rpc.getLogs = async () => []
  expect(await replayLiveKeys(rpc, s, 20)).toEqual([])
  expect(Number((await rows(s, 'SELECT block FROM replay_target'))[0]!.block)).toBe(20)
  expect(await rows(s, "SELECT 1 FROM information_schema.tables WHERE table_name = 'replay_fetched'")).toHaveLength(0)
})

test('log rows capture owner, creator, blocks, expiry and flags without overwriting fetched rows', async () => {
  const { writeLogRows } = await import('../src/replay')
  const { addr } = await import('./events')
  const { row } = await import('./helpers')
  const s = track(await Store.open(await temp(), '', 1, hash)), rpc = fake(async () => { throw Error('query') })
  rpc.getLogs = async () => [
    event(1, 'EntityCreated', 1, 50, { owner: addr(7), flags: 3 }), event(1, 'ExpiryExtended', 4, 80, { owner: addr(7) }), event(1, 'OwnershipTransferred', 6, 0, { owner: addr(7), newOwner: addr(9) }),
    event(2, 'EntityCreated', 2, 60, { owner: addr(8) }), event(2, 'EntityPatched', 5, 0, { owner: addr(8) }),
    event(3, 'EntityCreated', 2, 60), event(3, 'EntityDeleted', 3),
    event(4, 'EntityCreated', 2, 60),
  ]
  await s.upsert([row(key(4), 60)], null)
  expect(await replayLiveKeys(rpc, s, 10)).toEqual([key(1), key(2), key(4)])
  expect(await writeLogRows(s, 10)).toBe(2)
  const entities = await rows(s, 'SELECT * FROM entities ORDER BY key')
  expect(entities.map(e => ({ ...e, created_at: Number(e.created_at), updated_at: Number(e.updated_at), expires_at: Number(e.expires_at) }) as Record<string, unknown>)).toEqual([
    { key: key(1), owner: addr(9), creator: addr(7), created_at: 1, updated_at: 6, expires_at: 80, content_type: null, creation_flags: 3, attrs_pending: true },
    { key: key(2), owner: addr(8), creator: addr(8), created_at: 2, updated_at: 5, expires_at: 60, content_type: null, creation_flags: 0, attrs_pending: true },
    { key: key(4), owner: '0x02', creator: '0x02', created_at: 1, updated_at: 2, expires_at: 60, content_type: null, creation_flags: 0, attrs_pending: false },
  ])
  expect(await writeLogRows(s, 10)).toBe(0)
})
test('legacy replay tables get owner and flags from a resumable detail pass', async () => {
  const { replayDetails, writeLogRows } = await import('../src/replay')
  const { addr } = await import('./events')
  const s = track(await Store.open(await temp(), '', 1, hash)), rpc = fake(async () => { throw Error('query') })
  await s.conn.run(`CREATE TABLE replay_target(block UBIGINT); INSERT INTO replay_target VALUES (10);
    CREATE TABLE replay_events(key VARCHAR, kind VARCHAR, block UBIGINT, log_index INTEGER, expires_at UBIGINT, PRIMARY KEY(block, log_index));
    INSERT INTO replay_events VALUES ('${key(1)}', 'EntityCreated', 1, 1, 50), ('${key(1)}', 'OwnershipTransferred', 3, 1, NULL), ('${key(2)}', 'EntityCreated', 2, 2, 60);
    CREATE TABLE replay_state(next_block UBIGINT); INSERT INTO replay_state VALUES (11);
    CREATE TABLE replay_live(key VARCHAR PRIMARY KEY); INSERT INTO replay_live VALUES ('${key(1)}'), ('${key(2)}')`)
  const calls: number[][] = []
  rpc.getLogs = async (a, b) => {
    calls.push([a, b])
    if (calls.length === 2) throw Error('crash')
    return a === 0 ? [event(1, 'EntityCreated', 1, 50, { owner: addr(7), flags: 2 }), event(1, 'OwnershipTransferred', 3, 0, { owner: addr(7), newOwner: addr(9) }), event(2, 'EntityCreated', 2, 60, { owner: addr(8) })] : []
  }
  await expect(replayDetails(rpc, s, 10, () => {}, { window: 5 })).rejects.toThrow('crash')
  await replayDetails(rpc, s, 10, () => {}, { window: 5 })
  expect(calls).toEqual([[0, 4], [5, 9], [5, 9], [10, 10]])
  await replayDetails(rpc, s, 10)
  expect(calls).toHaveLength(4)
  expect(await writeLogRows(s, 10)).toBe(2)
  expect(await rows(s, 'SELECT key, owner, creator, creation_flags FROM entities ORDER BY key')).toEqual([
    { key: key(1), owner: addr(9), creator: addr(7), creation_flags: 2 },
    { key: key(2), owner: addr(8), creator: addr(8), creation_flags: 0 },
  ])
})
