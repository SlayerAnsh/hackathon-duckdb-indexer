import { DuckDBInstance } from '../../../packages/core/node_modules/@duckdb/node-api'
import { RAW_TABLES_SQL, MERGE_VIEWS_SQL, MATERIALIZE_SQL, setHeadSql } from '@asi/core'
import { OLD_MERGE_VIEWS_SQL } from '../../../packages/core/test/old-views'
import { VIEWS } from '../lib/views'
import { OLDEST_SQL } from '../lib/heights'

const instance = await DuckDBInstance.create(':memory:')
const db = await instance.connect()
const run = async (statements: string[]) => { for (const sql of statements) await db.run(sql) }
const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b)
  return (sorted[9]! + sorted[10]!) / 2
}
async function measure(work: () => Promise<void>) {
  await work() // Warm up binding and execution.
  const times: number[] = []
  for (let i = 0; i < 20; i++) {
    const start = performance.now()
    await work()
    times.push(performance.now() - start)
  }
  return median(times)
}
try {
  await run([...RAW_TABLES_SQL, ...setHeadSql(50000)])
  await db.run(`INSERT INTO base_entities
    SELECT 'key' || i, 'owner' || (i % 20), 'creator' || (i % 40),
      47000 + i % 3000, 47000 + i % 3000, 50100 + i % 100000, NULL, 0, i < 17000
    FROM range(31000) t(i)`)
  await db.run(`INSERT INTO base_attributes
    SELECT 'key' || i, a.name, 'str', a.value, a.num FROM range(17000, 31000) t(i)
    CROSS JOIN (VALUES ('type', 'ticket', NULL), ('status', 'open', NULL),
      ('priority', '2', 2.0), ('title', 'Example', NULL), ('project', 'bench', NULL),
      ('score', '42', 42.0)) a(name, value, num)`)
  await db.run(`INSERT INTO delta_entities SELECT * REPLACE (50001 AS updated_at, false AS attrs_pending)
    FROM base_entities WHERE key IN (SELECT 'key' || i FROM range(300) t(i))`)
  await db.run(`INSERT INTO delta_attributes SELECT e.key, a.name, a.type, a.value, a.num
    FROM delta_entities e CROSS JOIN (SELECT * FROM base_attributes WHERE key = 'key17000') a`)
  await db.run(`INSERT INTO live_entities SELECT * REPLACE (50002 AS updated_at)
    FROM delta_entities LIMIT 50`)
  await db.run('INSERT INTO live_attributes SELECT a.* FROM delta_attributes a JOIN live_entities e USING (key)')
  await db.run('INSERT INTO live_pending SELECT key FROM live_entities LIMIT 25')
  const widgets = [...VIEWS.flatMap(v => v.widgets), { id: 'oldest', sql: OLDEST_SQL }]
  const timings = new Map<string, number>()
  await run(OLD_MERGE_VIEWS_SQL)
  for (const widget of widgets) timings.set(widget.id, await measure(async () => { await db.runAndReadAll(widget.sql) }))
  await run(MERGE_VIEWS_SQL)
  const refresh = (sql: string[]) => run(['BEGIN TRANSACTION', ...sql, 'COMMIT'])
  const replace = await measure(() => refresh(MATERIALIZE_SQL))
  const insert = await measure(() => refresh([
    'DELETE FROM merged_entities', 'INSERT INTO merged_entities SELECT * FROM merged_entities_v',
    'DELETE FROM merged_attributes', 'INSERT INTO merged_attributes SELECT * FROM merged_attributes_v',
  ]))
  console.log('31,000 base entities (17,000 pending), 84,000 base attributes, 300 delta rows, 50 live rows')
  console.log('20 runs after warmup; native DuckDB, milliseconds (not WASM)')
  console.log('widget\told median\tmaterialized median')
  for (const widget of widgets) {
    const ms = await measure(async () => { await db.runAndReadAll(widget.sql) })
    console.log(`${widget.id}\t${timings.get(widget.id)!.toFixed(3)}\t${ms.toFixed(3)}`)
  }
  console.log(`Refresh CREATE OR REPLACE: ${replace.toFixed(3)} ms median`)
  console.log(`Refresh DELETE + INSERT: ${insert.toFixed(3)} ms median`)
} finally { db.closeSync(); instance.closeSync() }
