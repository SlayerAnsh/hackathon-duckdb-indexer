import { afterEach, beforeEach, expect, test } from 'bun:test'
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RAW_TABLES_SQL, MERGE_VIEWS_SQL, DELTA_TABLES, setHeadSql, loadSnapshotSql } from '../src/views'

let db: DuckDBInstance
let conn: DuckDBConnection
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
async function run(statements: readonly string[]) {
  for (const sql of statements) await conn.run(sql)
}
async function rows(sql: string) {
  return (await conn.runAndReadAll(sql)).getRowObjects()
}
async function entity(source: 'base' | 'delta', key = 'a', expiry = 200, updated = 10) {
  await conn.run(`INSERT INTO ${source}_entities VALUES (${quote(key)}, 'owner', 'creator', 1, ${updated}, ${expiry}, NULL, 0)`)
}
async function attr(source: 'base' | 'delta', name = 'status', value = 'open', key = 'a') {
  await conn.run(`INSERT INTO ${source}_attributes VALUES (${quote(key)}, ${quote(name)}, 'str', ${quote(value)}, NULL)`)
}
async function expectHidden() {
  expect(await rows('SELECT * FROM entities')).toEqual([])
  expect(await rows('SELECT * FROM attributes')).toEqual([])
}
beforeEach(async () => {
  db = await DuckDBInstance.create(':memory:')
  conn = await db.connect()
  await run(RAW_TABLES_SQL)
  await run(MERGE_VIEWS_SQL)
  await run(setHeadSql(100))
})
afterEach(() => { conn?.closeSync(); db?.closeSync() })

test('base only preserves public columns and attributes', async () => {
  await entity('base'); await attr('base')
  expect(await rows('SELECT * FROM entities')).toEqual([{
    key: 'a', owner: 'owner', creator: 'creator', created_at: 1n,
    updated_at: 10n, expires_at: 200n, content_type: null, creation_flags: 0,
  }])
  expect(await rows('SELECT * FROM attributes')).toEqual([
    { key: 'a', name: 'status', type: 'str', value: 'open', num: null },
  ])
})
test('expired hidden at equality, visible before expiry', async () => {
  await entity('base', 'a', 100); await attr('base')
  await expectHidden()
  await run(setHeadSql(99))
  expect(await rows('SELECT key FROM entities')).toEqual([{ key: 'a' }])
  expect(await rows('SELECT value FROM attributes')).toEqual([{ value: 'open' }])
  expect(await rows('SELECT * FROM live_head')).toEqual([{ block: 99n }])
})
test('delta upsert wins', async () => {
  await entity('base'); await attr('base')
  await entity('delta', 'a', 200, 20); await attr('delta', 'status', 'closed')
  expect(await rows('SELECT updated_at FROM entities')).toEqual([{ updated_at: 20n }])
  expect(await rows('SELECT value FROM attributes')).toEqual([{ value: 'closed' }])
})
test('patch removes attribute', async () => {
  await entity('base'); await attr('base', 'x'); await attr('base', 'y')
  await entity('delta'); await attr('delta', 'x')
  expect(await rows('SELECT name FROM attributes')).toEqual([{ name: 'x' }])
})
test('patch can remove every attribute', async () => {
  await entity('base'); await attr('base'); await entity('delta')
  expect(await rows('SELECT key FROM entities')).toEqual([{ key: 'a' }])
  expect(await rows('SELECT * FROM attributes')).toEqual([])
})
test('tombstone hides entity and attributes after deletion or leaving filter', async () => {
  await entity('base'); await attr('base')
  await conn.run("INSERT INTO delta_tombstones VALUES ('a', 30)")
  await expectHidden()
})
test('recreated key represented by delta entity replaces base', async () => {
  await entity('base'); await attr('base')
  await entity('delta', 'a', 300, 40); await attr('delta', 'status', 'recreated')
  expect(await rows('SELECT updated_at FROM entities')).toEqual([{ updated_at: 40n }])
  expect(await rows('SELECT value FROM attributes')).toEqual([{ value: 'recreated' }])
})
test('extend revives expired base', async () => {
  await entity('base', 'a', 90); await entity('delta', 'a', 300)
  expect(await rows('SELECT expires_at FROM entities')).toEqual([{ expires_at: 300n }])
})
test('delta new key shows with attributes', async () => {
  await entity('delta', 'b'); await attr('delta', 'status', 'new', 'b')
  expect(await rows('SELECT key FROM entities')).toEqual([{ key: 'b' }])
  expect(await rows('SELECT value FROM attributes')).toEqual([{ value: 'new' }])
})
test('expired delta never falls back to live base', async () => {
  await entity('base'); await attr('base'); await entity('delta', 'a', 100)
  await expectHidden()
})
test('empty head hides all sources', async () => {
  await entity('base'); await attr('base'); await entity('delta', 'b')
  await attr('delta', 'status', 'new', 'b')
  await conn.run('DELETE FROM live_head')
  await expectHidden()
})
test('raw setup is idempotent and delta table names are exported', async () => {
  await entity('base')
  await run(RAW_TABLES_SQL); await run(MERGE_VIEWS_SQL)
  expect(await rows('SELECT key FROM entities')).toEqual([{ key: 'a' }])
  expect(DELTA_TABLES).toEqual(['delta_entities', 'delta_attributes', 'delta_tombstones'])
})
test('loadSnapshotSql round trip replaces tables and escapes quotes', async () => {
  const dir = await mkdtemp(join(tmpdir(), "views'"))
  try {
    const entities = join(dir, 'entities.parquet')
    const attributes = join(dir, 'attributes.parquet')
    await entity('base'); await attr('base')
    await conn.run(`COPY base_entities TO ${quote(entities)} (FORMAT parquet)`)
    await conn.run(`COPY base_attributes TO ${quote(attributes)} (FORMAT parquet)`)
    await entity('base', 'old'); await attr('base', 'status', 'old', 'old')
    await run(loadSnapshotSql(entities, attributes))
    expect(await rows('SELECT key FROM entities')).toEqual([{ key: 'a' }])
    expect(await rows('SELECT value FROM attributes')).toEqual([{ value: 'open' }])
  } finally { await rm(dir, { recursive: true, force: true }) }
})
