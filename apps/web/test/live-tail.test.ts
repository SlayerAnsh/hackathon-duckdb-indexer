import { test, expect, afterEach } from 'bun:test'
import { encodeEventTopics, encodeAbiParameters } from 'viem'
import { ENTITY_EVENTS_ABI, type EntityRow, type RawLog } from '@asi/core'
import { changesFromLogs, LiveTail, type LiveStatus } from '../lib/live-tail'
const key = ('0x' + '11'.repeat(32)) as `0x${string}`
const owner = ('0x' + '22'.repeat(20)) as `0x${string}`
const next = ('0x' + '33'.repeat(20)) as `0x${string}`
const row: EntityRow = { key, owner, creator: owner, created_at: 1, updated_at: 1, expires_at: 999, creation_flags: 0, content_type: null }
function log(eventName: string, block = 2): RawLog {
  const args = { entityKey: key, owner, previousOwner: owner, newOwner: next }
  const topics = encodeEventTopics({ abi: ENTITY_EVENTS_ABI, eventName: eventName as any, args: args as any }) as string[]
  const data = eventName === 'EntityCreated' ? encodeAbiParameters([{ type: 'uint64' }, { type: 'uint8' }], [BigInt(999), 3]) : eventName === 'ExpiryExtended' ? encodeAbiParameters([{ type: 'uint64' }], [BigInt(2000)]) : '0x'
  return { topics, data, blockNumber: block, logIndex: 0, transactionHash: '0x01' }
}
test('all event fields, ordering, unknown patch and create/delete collapse', () => {
  expect(changesFromLogs([log('EntityPatched')], () => undefined)).toEqual([])
  expect(changesFromLogs([log('EntityCreated')], () => undefined)[0]).toMatchObject({ kind: 'upsert', entity: { owner, creator: owner, created_at: 2, updated_at: 2, creation_flags: 3, content_type: null }, needsAttributes: true })
  expect(changesFromLogs([log('EntityPatched')], () => row)[0]).toMatchObject({ needsAttributes: true, entity: { updated_at: 2 } })
  expect(changesFromLogs([log('ExpiryExtended')], () => row)[0]).toMatchObject({ needsAttributes: false, entity: { expires_at: 2000 } })
  expect(changesFromLogs([log('OwnershipTransferred')], () => row)[0]).toMatchObject({ needsAttributes: false, entity: { owner: next } })
  expect(changesFromLogs([log('EntityDeleted', 3), log('EntityCreated')], () => undefined)).toEqual([{ kind: 'tombstone', key, block: 3 }])
})
const original = globalThis.fetch
afterEach(() => { globalThis.fetch = original })
test('throttles queries, preserves pending on 429, retries then tombstones missing keys', async () => {
  let now = 0, queries = 0, head = 2
  const sql: string[] = [], statuses: LiveStatus[] = []
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    expect(new Headers(init.headers).has('authorization')).toBe(false)
    const request = JSON.parse(String(init.body))
    if (request.method === 'arkiv_query') {
      queries++
      if (queries === 1) return Response.json({ error: 'ANON_COST_LIMITED' }, { status: 429, headers: { 'Retry-After': '30' } })
      return Response.json({ result: { data: [], blockNumber: '0x3' } })
    }
    return Response.json({ result: request.method === 'eth_blockNumber' ? '0x' + head.toString(16) : head === 2 ? [log('EntityCreated')].map(l => ({ ...l, blockNumber: '0x2', logIndex: '0x0' })) : [] })
  }) as typeof fetch
  const tail = new LiveTail({ rpcUrl: 'http://fake', expression: '$expiresAt > u64(0)', apply: async statements => { sql.push(...statements) }, known: async () => undefined, onStatus: s => statuses.push(s), now: () => now })
  // tick is the deterministic single-iteration seam; start owns the timer.
  await tail.tick(2)
  expect(queries).toBe(1)
  expect(statuses.at(-1)).toMatchObject({ pending: 1, budget: 'exhausted', retryAt: 30000 })
  head = 3; now = 20000; await tail.tick(); expect(queries).toBe(1)
  now = 30000; await tail.tick(); expect(queries).toBe(2)
  expect(sql.some(s => s.includes('INSERT INTO live_tombstones'))).toBe(true)
  expect(statuses.at(-1)).toMatchObject({ pending: 0, budget: 'ok' })
})
test('successful attribute fetches throttle and foreign creations are excluded', async () => {
  let now = 0, head = 2, queries = 0
  const sql: string[] = []
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    const { method } = JSON.parse(String(init.body))
    if (method === 'arkiv_query') { queries++; return Response.json({ result: { data: [], blockNumber: '0x' + head.toString(16) } }) }
    return Response.json({ result: method === 'eth_blockNumber' ? '0x' + head.toString(16) : [log('EntityCreated', head)].map(l => ({ ...l, blockNumber: '0x' + head.toString(16), logIndex: '0x0' })) })
  }) as typeof fetch
  const options = { rpcUrl: 'http://fake', expression: '$expiresAt > u64(0)', apply: async (s: string[]) => { sql.push(...s) }, known: async () => undefined, onStatus: () => {}, now: () => now }
  const tail = new LiveTail(options)
  await tail.tick(2); expect(queries).toBe(1)
  head = 3; now = 19999; await tail.tick(); expect(queries).toBe(1)
  now = 20000; await tail.tick(); expect(queries).toBe(2)
  sql.length = 0
  await new LiveTail({ ...options, expression: '$creator = addr(' + next + ')' }).tick(3)
  expect(queries).toBe(2); expect(sql).toEqual([])
})
test('successful query replaces attributes and deletion drops pending during backoff', async () => {
  let head = 2, now = 0, queries = 0
  const sql: string[] = [], statuses: LiveStatus[] = []
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    const { method } = JSON.parse(String(init.body))
    if (method === 'arkiv_query') {
      queries++
      if (queries > 1) return Response.json({ error: 'ANON_COST_LIMITED' }, { status: 429, headers: { 'Retry-After': '60' } })
      return Response.json({ result: { data: [{ key, owner, creator: owner, createdAt: '0x2', updatedAt: '0x2', expiresAt: '0x3e7', creationFlags: { raw: 3 }, attributes: [{ name: 'status', type: 'str', value: "it's open" }] }], blockNumber: '0x2' } })
    }
    const event = head === 4 ? 'EntityDeleted' : 'EntityCreated'
    return Response.json({ result: method === 'eth_blockNumber' ? '0x' + head.toString(16) : [log(event, head)].map(l => ({ ...l, blockNumber: '0x' + head.toString(16), logIndex: '0x0' })) })
  }) as typeof fetch
  const tail = new LiveTail({ rpcUrl: 'http://fake', expression: '$expiresAt > u64(0)', apply: async s => { sql.push(...s) }, known: async () => row, onStatus: s => statuses.push(s), now: () => now })
  await tail.tick(2)
  expect(sql.some(s => s.includes("it''s open"))).toBe(true)
  expect(statuses.at(-1)?.pending).toBe(0)
  head = 3; now = 20000; await tail.tick()
  expect(statuses.at(-1)?.pending).toBe(1)
  head = 4; now = 24000; await tail.tick()
  expect(queries).toBe(2)
  expect(statuses.at(-1)).toMatchObject({ pending: 0, budget: 'exhausted', block: 4 })
})

test('live log apply refreshes public rows and preserves attributes on transfer', async () => {
  const { DuckDBInstance } = await import('../../../packages/core/node_modules/@duckdb/node-api')
  const { RAW_TABLES_SQL, MERGE_VIEWS_SQL, MATERIALIZE_SQL, setHeadSql } = await import('@asi/core')
  const instance = await DuckDBInstance.create(':memory:'); const conn = await instance.connect()
  const apply = async (statements: string[]) => { for (const sql of statements) await conn.run(sql) }
  try {
    await apply([...RAW_TABLES_SQL, ...MERGE_VIEWS_SQL, ...setHeadSql(1)])
    await conn.run(`INSERT INTO base_entities VALUES ('${key}','${owner}','${owner}',1,1,999,NULL,0,false)`)
    await conn.run(`INSERT INTO base_attributes VALUES ('${key}','status','str','open',NULL)`)
    await apply(MATERIALIZE_SQL)
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
      const { method } = JSON.parse(String(init.body))
      return Response.json({ result: method === 'eth_blockNumber' ? '0x2' : [{ ...log('OwnershipTransferred'), blockNumber: '0x2', logIndex: '0x0' }] })
    }) as typeof fetch
    const tail = new LiveTail({ rpcUrl: 'http://fake', expression: '$expiresAt > u64(0)', apply, known: async () => row, onStatus: () => {} })
    await tail.tick(2)
    expect((await conn.runAndReadAll('SELECT owner FROM entities')).getRowObjects()).toEqual([{ owner: next }])
    expect((await conn.runAndReadAll('SELECT value FROM attributes')).getRowObjects()).toEqual([{ value: 'open' }])
  } finally { conn.closeSync(); instance.closeSync() }
})

test('all previous attributes are captured before any raw writes in a multi-key batch', async () => {
  const second = ('0x' + '44'.repeat(32)) as `0x${string}`
  let statements: string[] = []
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    const { method } = JSON.parse(String(init.body))
    return Response.json({ result: method === 'eth_blockNumber' ? '0x2' : [key, second].map(k => ({
      ...log('OwnershipTransferred'), topics: encodeEventTopics({ abi: ENTITY_EVENTS_ABI, eventName: 'OwnershipTransferred', args: { entityKey: k, previousOwner: owner, newOwner: next } }),
      blockNumber: '0x2', logIndex: '0x0',
    })) })
  }) as typeof fetch
  await new LiveTail({ rpcUrl: 'http://fake', expression: '$expiresAt > u64(0)',
    apply: async sql => { statements = sql }, known: async k => ({ ...row, key: k }), onStatus: () => {},
  }).tick(2)
  const firstWrite = statements.findIndex(sql => /^(DELETE|INSERT) /.test(sql))
  expect(firstWrite).toBeGreaterThan(0)
  expect(statements.slice(firstWrite).some(sql => sql.includes('AS SELECT * FROM attributes'))).toBe(false)
})
