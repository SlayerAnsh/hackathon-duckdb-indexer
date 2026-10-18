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
