import { expect, test } from 'bun:test'
import { getLogsSplitting, isLogCapacityError, RpcError, type RawLog } from '../src'

const rabdi = () => new RpcError('golemdb segment_range_of(transactions): NotImplemented', 200, -32603)
test('capacity errors cover max results and the Rabdi segment error, nothing else', () => {
  expect(isLogCapacityError(new RpcError('query exceeds max results 20000', 200, -32602))).toBe(true)
  expect(isLogCapacityError(rabdi())).toBe(true)
  expect(isLogCapacityError(new RpcError('internal error', 200, -32603))).toBe(false)
  expect(isLogCapacityError(new RpcError('rate limited', 429, -32005))).toBe(false)
  expect(isLogCapacityError(new Error('golemdb segment_range_of(transactions): NotImplemented'))).toBe(false)
})
test('getLogsSplitting halves dense ranges until they succeed and keeps block order', async () => {
  const calls: [number, number][] = []
  const rpc = { getLogs: async (a: number, b: number): Promise<RawLog[]> => {
    calls.push([a, b]); if (b - a >= 250) throw rabdi()
    return [{ topics: [], data: '0x', blockNumber: a, logIndex: 0, transactionHash: '0x' }] } }
  const logs = await getLogsSplitting(rpc, 0, 999)
  expect(logs.map(l => l.blockNumber)).toEqual([0, 250, 500, 750])
  expect(calls[0]).toEqual([0, 999])
})
test('getLogsSplitting rethrows other errors and a capacity error on one block', async () => {
  await expect(getLogsSplitting({ getLogs: async () => { throw new RpcError('boom', 500, -32000) } }, 0, 9)).rejects.toThrow('boom')
  await expect(getLogsSplitting({ getLogs: async () => { throw rabdi() } }, 5, 5)).rejects.toThrow('NotImplemented')
})
