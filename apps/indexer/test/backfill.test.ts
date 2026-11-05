import { test, expect, mock } from 'bun:test'
import { ROW_SELECT } from '@asi/core'
import { backfill, scanQuery, scanRanges, SCAN_RANGES, SCAN_CONCURRENCY } from '../src/backfill'
import { Store } from '../src/store'
import { temp, track, raw, fake, rows, hash, expression } from './helpers'
const k = (n: number) => '0x' + n.toString(16).padStart(64, '0')
test('scans the latest state in key order, 100 per page, resuming after the last key', async () => {
  const s = track(await Store.open(await temp(), expression, 1, hash))
  const all = Array.from({ length: 207 }, (_, n) => k(n + 1))
  const query = mock(async (text: string, opts: Parameters<import("@asi/core").ArkivRpc["query"]>[1]) => {
    const after = /\$key > key\((0x[0-9a-f]+)\)/.exec(text)?.[1]
    const from = after ? all.indexOf(after) + 1 : 0
    return { data: all.slice(from, from + 100).map(key => raw(key)), blockNumber: 100 + from }
  })
  expect(await backfill(fake(query), s, expression, undefined, { ranges: 1 })).toBe(207)
  expect(await s.indexedKeys()).toHaveProperty('size', 207)
  expect(query).toHaveBeenCalledTimes(3)
  expect(query.mock.calls.map(c => c[0])).toEqual([
    '($creator = addr(0x1234)) ORDER BY $key:key ASC',
    `($creator = addr(0x1234)) AND $key > key(${k(100)}) ORDER BY $key:key ASC`,
    `($creator = addr(0x1234)) AND $key > key(${k(200)}) ORDER BY $key:key ASC`])
  for (const call of query.mock.calls) expect(call[1]).toEqual({ limit: 100, select: ROW_SELECT })
  expect(await rows(s, 'SELECT * FROM changes')).toHaveLength(0)
})
test('blank expression scans every entity', async () => {
  const { scanQuery } = await import('../src/backfill')
  expect(scanQuery('', null)).toBe('* ORDER BY $key:key ASC')
  expect(scanQuery('', k(5))).toBe(`$key > key(${k(5)}) ORDER BY $key:key ASC`)
})
test('rate limits and network errors are retried; other RPC errors stop the scan', async () => {
  const { RpcError } = await import('@asi/core')
  const s = track(await Store.open(await temp(), expression, 1, hash))
  let calls = 0
  const flaky = mock(async () => {
    calls++
    if (calls === 1) throw new RpcError('busy', 429, -32005, '0')
    if (calls === 2) throw Error('fetch failed')
    return { data: [raw(k(1))], blockNumber: 100 }
  })
  const sleeps: number[] = []
  expect(await backfill(fake(flaky), s, expression, () => {}, { ranges: 1, sleep: async ms => { sleeps.push(ms) } })).toBe(1)
  expect(sleeps).toEqual([0, 2000])
  const bad = mock(async () => { throw new RpcError('query error', 200, -32001) })
  await expect(backfill(fake(bad), s, expression, () => {}, { ranges: 1, sleep: async () => {} })).rejects.toThrow('query error')
  expect(bad).toHaveBeenCalledTimes(1)
})
test('RPC failure preserves completed pages only', async () => {
  const s = track(await Store.open(await temp(), expression, 1, hash))
  const query = mock(async (text: string, opts: Parameters<import("@asi/core").ArkivRpc["query"]>[1]) => { if (text.includes('$key >')) throw Error('unavailable'); return { data: Array.from({ length: 100 }, (_, n) => raw(k(n + 1))), blockNumber: 100 } })
  await expect(backfill(fake(query), s, expression, () => {}, { ranges: 1, sleep: async () => {} })).rejects.toThrow('unavailable')
  expect((await s.indexedKeys()).size).toBe(100)
  expect(await s.state()).toBeNull()
})
test('invalid entity rolls back entire page', async () => {
  const s = track(await Store.open(await temp(), expression, 1, hash))
  await expect(backfill(fake(async () => ({ data: [raw(), {}], blockNumber: 100 })), s, expression)).rejects.toThrow()
  expect((await s.indexedKeys()).size).toBe(0)
})
test('key backfill chunks 120 keys, reads latest rows and omits missing keys', async () => {
  const { backfillByKeys } = await import('../src/backfill')
  const keys = Array.from({ length: 120 }, (_, n) => '0x' + n.toString(16).padStart(64, '0'))
  const s = track(await Store.open(await temp(), '', 1, hash))
  const query = mock(async () => ({ data: [raw(keys[0])], blockNumber: 100 }))
  expect(await backfillByKeys(fake(query), s, '', keys, 100)).toBe(3)
  expect(query).toHaveBeenCalledTimes(3)
  for (const [text, opts] of query.mock.calls as any) {
    expect(text).toContain('$key = key(')
    expect(text).not.toContain('AND')
    expect(opts).toEqual({ limit: 100, select: ROW_SELECT })
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
  const result = await bootstrap(loadConfig({ BACKFILL_MODE: 'logs', ARKIV_API_KEY: 'x', DATA_DIR: await temp() }), logs, () => {}, query)
  track(result.store)
  expect(query.query).not.toHaveBeenCalled()
  expect(await rows(result.store, 'SELECT key, attrs_pending FROM entities')).toEqual([{ key: '0x' + '1'.padStart(64, '0'), attrs_pending: true }])
})
test('default bootstrap scans the latest state on the public RPC and checkpoints the head read before it', async () => {
  const { bootstrap } = await import('../src/main')
  const { loadConfig } = await import('../src/config')
  const pub = fake(mock(async () => ({ data: [raw(k(9))], blockNumber: 150 })))
  pub.getLogs = async () => { throw Error('logs must not be replayed') }
  const keyed = fake(mock(async () => { throw Error('keyed query forbidden') }))
  const result = await bootstrap(loadConfig({ DATA_DIR: await temp() }), pub, () => {}, keyed)
  track(result.store)
  expect(result.head).toBe(100)
  expect(keyed.query).not.toHaveBeenCalled()
  expect(await rows(result.store, 'SELECT key, attrs_pending FROM entities')).toEqual([{ key: k(9), attrs_pending: false }])
})

test('scan ranges cover the full key space with exact contiguous bounds', () => {
  expect(SCAN_RANGES).toBe(16)
  expect(SCAN_CONCURRENCY).toBe(4)
  const ranges = scanRanges(16)
  expect(ranges).toHaveLength(16)
  expect(ranges[0]!.lo).toBe(k(0))
  expect(ranges[15]!.hi).toBeNull()
  for (let i = 0; i < ranges.length; i++) {
    expect(ranges[i]!.lo).toMatch(/^0x[0-9a-f]{64}$/)
    if (i < 15) expect(ranges[i]!.hi).toBe(ranges[i + 1]!.lo)
  }
  for (const n of [0, -1, 3, 1.5, 257, NaN, Infinity]) expect(() => scanRanges(n)).toThrow()
  expect(scanRanges(256)).toHaveLength(256)
})

test('scan query combines expression, range bounds and cursor', () => {
  const range = scanRanges(4)[1]!
  const after = range.lo.slice(0, -1) + '1'
  expect(scanQuery(expression, null, range)).toBe(`(${expression}) AND $key >= key(${range.lo}) AND $key < key(${range.hi}) ORDER BY $key:key ASC`)
  expect(scanQuery(expression, after, range)).toBe(`(${expression}) AND $key > key(${after}) AND $key < key(${range.hi}) ORDER BY $key:key ASC`)
  expect(scanQuery('   ', null, range)).toBe(`$key >= key(${range.lo}) AND $key < key(${range.hi}) ORDER BY $key:key ASC`)
  expect(scanQuery('', null, scanRanges(4)[3])).toBe(`$key >= key(${scanRanges(4)[3]!.lo}) ORDER BY $key:key ASC`)
  expect(scanQuery(expression, null)).toBe(`(${expression}) ORDER BY $key:key ASC`)
  expect(scanQuery(expression, k(5))).toBe(`(${expression}) AND $key > key(${k(5)}) ORDER BY $key:key ASC`)
})

test('parallel range scans store every random key once and serialize transactions', async () => {
  const { createHash } = await import('node:crypto')
  const all = Array.from({ length: 500 }, (_, i) => '0x' + createHash('sha256').update(String(i)).digest('hex')).sort()
  const s = track(await Store.open(await temp(), expression, 1, hash))
  let inFlight = 0, maxInFlight = 0, inTransaction = false, overlaps = 0
  const stored: string[] = []
  const transaction = s.transaction.bind(s), upsert = s.upsert.bind(s)
  s.transaction = async work => {
    if (inTransaction) overlaps++
    inTransaction = true
    try { await Bun.sleep(1); return await transaction(work) } finally { inTransaction = false }
  }
  s.upsert = async (entities, block) => { stored.push(...entities.map(e => e.entity.key)); return upsert(entities, block) }
  const query = mock(async (text: string) => {
    maxInFlight = Math.max(maxInFlight, ++inFlight)
    try {
      await Bun.sleep(2)
      const bounds = [...text.matchAll(/\$key (>=|>|<) key\((0x[0-9a-f]+)\)/g)]
      const keys = all.filter(key => bounds.every(([, op, bound]) => op === '>=' ? key >= bound! : op === '>' ? key > bound! : key < bound!))
      return { data: keys.slice(0, 100).map(key => raw(key)), blockNumber: 100 }
    } finally { inFlight-- }
  })
  const logs: string[] = []
  expect(await backfill(fake(query), s, expression, msg => logs.push(msg), { ranges: 4, concurrency: 2 })).toBe(all.length)
  expect(stored.sort()).toEqual(all)
  expect((await s.indexedKeys()).size).toBe(all.length)
  expect(maxInFlight).toBe(2)
  expect(overlaps).toBe(0)
  expect(inTransaction).toBe(false)
  expect(logs).toEqual(['Backfilled 500 rows (latest state, block 100) across 4 ranges'])
})

test('a failing range drains active writes and stops launching ranges', async () => {
  const { RpcError } = await import('@asi/core')
  let startWrite!: () => void, releaseWrite!: () => void
  const started = new Promise<void>(resolve => { startWrite = resolve })
  const release = new Promise<void>(resolve => { releaseWrite = resolve })
  let writing = false, finished = false, calls = 0, retries = 0
  const error = new RpcError('range unavailable', 503, -32000)
  const store = {
    transaction: async (work: () => Promise<void>) => {
      writing = true; startWrite()
      await release
      try { await work() } finally { writing = false; finished = true }
    },
    upsert: async () => {},
  } as unknown as Store
  const query = mock(async (text: string) => {
    calls++
    if (text.includes('$key >=')) {
      await started
      if (++retries === 8) releaseWrite()
      throw error
    }
    return { data: [raw(k(1))], blockNumber: 100 }
  })
  await expect(backfill(fake(query), store, '', undefined, { ranges: 4, concurrency: 2, sleep: async () => {} })).rejects.toBe(error)
  expect(calls).toBe(9)
  expect(finished).toBe(true)
  expect(writing).toBe(false)
})

test('a range with a repeated full page fails the advance guard', async () => {
  const s = track(await Store.open(await temp(), expression, 1, hash))
  const query = mock(async () => ({ data: Array.from({ length: 100 }, (_, i) => raw(k(i + 1))), blockNumber: 100 }))
  await expect(backfill(fake(query), s, '', undefined, { ranges: 1 })).rejects.toThrow('Backfill scan did not advance')
  expect(query).toHaveBeenCalledTimes(2)
})
