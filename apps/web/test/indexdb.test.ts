import { expect, test } from 'bun:test'
import { MATERIALIZE_SQL, RAW_TABLES_SQL, MERGE_VIEWS_SQL, setHeadSql, type Delta, type Manifest } from '@asi/core'
import { applyDeltaSql, chainCheck } from '../lib/indexdb'

const empty: Delta = { fromBlock: 1, toBlock: 2, entities: [], attributes: [], tombstones: [] }

test('empty delta clears all three tables', () => {
  expect(applyDeltaSql(empty)).toEqual(['DELETE FROM delta_entities', 'DELETE FROM delta_attributes', 'DELETE FROM delta_tombstones', ...MATERIALIZE_SQL])
})

test('delta escapes strings, leaves numbers unquoted and preserves NULL', () => {
  const sql = applyDeltaSql({ ...empty,
    entities: [{ key: 'k', owner: 'o', creator: 'c', created_at: 1, updated_at: 2, expires_at: 10, content_type: null, creation_flags: 0 }],
    attributes: [{ key: 'k', name: "it's", type: 'str', value: "it's", num: null }, { key: 'k', name: 'n', type: 'i32', value: '42', num: 42 }],
    tombstones: [{ key: "it's", block: 9 }],
  }).join(';')
  expect(sql).toContain("'it''s'")
  expect(sql).toContain("'k', 'o', 'c', 1, 2, 10, NULL, 0")
  expect(sql).toContain("'str', 'it''s', NULL")
  expect(sql).toContain("'i32', '42', 42")
  expect(sql).toContain("'it''s', 9")
})

test('delta carries the pending flag of log derived rows', () => {
  const row = { key: 'k', owner: 'o', creator: 'c', created_at: 1, updated_at: 2, expires_at: 10, content_type: null, creation_flags: 0 }
  const sql = applyDeltaSql({ ...empty, entities: [{ ...row, attrs_pending: true }, { ...row, key: 'f' }] }).join(';')
  expect(sql).toContain("'k', 'o', 'c', 1, 2, 10, NULL, 0, true")
  expect(sql).toContain("'f', 'o', 'c', 1, 2, 10, NULL, 0, false")
})

const manifest = { chainId: 1, genesisHash: '0xabc' } as Manifest
test('chain matches', () => expect(chainCheck(manifest, 1, '0xABC')).toEqual({ ok: true }))
test('chain mismatch has reason', () => {
  expect(chainCheck(manifest, 2, '0xabc').ok).toBe(false)
  expect(chainCheck(manifest, 2, '0xabc').reason).toMatch(/chain/i)
})
test('genesis mismatch has reason', () => {
  expect(chainCheck(manifest, 1, '0xdef').ok).toBe(false)
  expect(chainCheck(manifest, 1, '0xdef').reason).toMatch(/genesis/i)
})

test('run excludes queued wait and measures send through last batch', async () => {
 const { IndexDb } = await import('../lib/indexdb')
 const { spyOn } = await import('bun:test')
 let now = 0
 const clock = spyOn(performance, 'now').mockImplementation(() => now)
 let release!: () => void
 const queue = new Promise<void>(resolve => { release = resolve })
 const reader = {
  schema: { fields: [{ name: 'value' }] },
  async open() { now += 2 },
  async *[Symbol.asyncIterator]() {
   now += 3
   yield { numRows: 1, getChildAt: () => ({ get: () => 42 }) }
   now += 4
  },
  async cancel() { now += 100 },
 }
 const db = Object.assign(Object.create(IndexDb.prototype), {
  queue, queries: { async send() { now += 1; return reader } },
 }) as import('../lib/indexdb').IndexDb
 try {
  const pending = db.run('SELECT 42')
  now += 500
  release()
  expect(await pending).toEqual({ columns: ['value'], rows: [[42]], truncated: false, elapsedMs: 10 })
 } finally { clock.mockRestore() }
})

test('delta refreshes public rows and head-only changes enforce expiry', async () => {
  const { DuckDBInstance } = await import('../../../packages/core/node_modules/@duckdb/node-api')
  const instance = await DuckDBInstance.create(':memory:')
  const conn = await instance.connect()
  try {
    for (const sql of [...RAW_TABLES_SQL, ...MERGE_VIEWS_SQL, ...setHeadSql(1), ...applyDeltaSql({ ...empty,
      entities: [{ key: 'new', owner: 'o', creator: 'c', created_at: 1, updated_at: 2, expires_at: 3, content_type: null, creation_flags: 0 }],
    })]) await conn.run(sql)
    expect((await conn.runAndReadAll('SELECT key FROM entities')).getRowObjects()).toEqual([{ key: 'new' }])
    for (const sql of setHeadSql(3)) await conn.run(sql)
    expect((await conn.runAndReadAll('SELECT * FROM entities')).getRowObjects()).toEqual([])
    expect((await conn.runAndReadAll('SELECT key FROM merged_entities')).getRowObjects()).toEqual([{ key: 'new' }])
  } finally { conn.closeSync(); instance.closeSync() }
})

test('snapshot rollover clears live rows and refreshes within its transaction', async () => {
  const { DuckDBInstance } = await import('../../../packages/core/node_modules/@duckdb/node-api')
  const { IndexDb } = await import('../lib/indexdb')
  const instance = await DuckDBInstance.create(':memory:'); const conn = await instance.connect()
  const statements: string[] = []
  const original = globalThis.fetch
  const nextManifest = { ...manifest, version: 2, snapshotBlock: 10, expression: '', files: { entities: 'snap/v2/entities.parquet', attributes: 'snap/v2/attributes.parquet' } }
  const db = Object.assign(Object.create(IndexDb.prototype), {
    origin: 'http://fake', state: { manifest: { ...nextManifest, version: 1 } }, manifestAt: 0,
    rpc: { chainId: async () => 2, genesisHash: async () => '0xabc', blockNumber: async () => 12 },
    connection: { query: async (sql: string) => {
      statements.push(sql)
      // Substitute fixture tables for remote Parquet, preserving the production transaction flow.
      if (sql.startsWith('INSERT INTO base_entities BY NAME')) sql = 'INSERT INTO base_entities BY NAME SELECT * FROM fixture_entities'
      if (sql.startsWith('CREATE OR REPLACE TABLE base_attributes AS')) sql = 'CREATE OR REPLACE TABLE base_attributes AS SELECT * FROM fixture_attributes'
      await conn.run(sql)
    } },
  }) as any
  try {
    for (const sql of [...RAW_TABLES_SQL, ...MERGE_VIEWS_SQL, ...setHeadSql(1),
      "INSERT INTO live_entities VALUES ('old-live','o','c',1,2,100,NULL,0,false)",
      "INSERT INTO live_attributes VALUES ('old-live','status','str','old',NULL)",
      'CREATE TABLE fixture_entities AS SELECT * FROM base_entities',
      "INSERT INTO fixture_entities VALUES ('snapshot','o','c',1,2,100,NULL,0,false)",
      'CREATE TABLE fixture_attributes AS SELECT * FROM base_attributes', ...MATERIALIZE_SQL,
    ]) await conn.run(sql)
    globalThis.fetch = (async (url: unknown) => String(url).endsWith('manifest.json')
      ? Response.json(nextManifest) : new Response(null, { status: 304 })) as typeof fetch
    await db.poll()
    expect((await conn.runAndReadAll('SELECT key FROM entities')).getRowObjects()).toEqual([{ key: 'snapshot' }])
    expect((await conn.runAndReadAll('SELECT * FROM live_entities')).getRowObjects()).toEqual([])
    expect((await conn.runAndReadAll('SELECT * FROM attributes')).getRowObjects()).toEqual([])
    const commit = statements.indexOf('COMMIT')
    expect(statements.slice(commit - MATERIALIZE_SQL.length, commit)).toEqual(MATERIALIZE_SQL)
    // The following transaction only advances the head.
    expect(statements.slice(commit + 1)).toEqual(['BEGIN TRANSACTION', ...setHeadSql(12), 'COMMIT'])
  } finally { globalThis.fetch = original; conn.closeSync(); instance.closeSync() }
})
