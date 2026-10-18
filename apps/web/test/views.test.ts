import { test, expect } from 'bun:test'
import { DuckDBInstance } from '../../../packages/core/node_modules/@duckdb/node-api'
import { RAW_TABLES_SQL, MERGE_VIEWS_SQL, setHeadSql } from '@asi/core'
import { ACTIVITY_SQL } from '../components/dash/ActivityFeed'
import { VIEWS, DEFAULT_SQL } from '../lib/views'
test('every widget executes on populated and empty public views with declared columns', async () => {
 const instance = await DuckDBInstance.create(':memory:'); const db = await instance.connect()
 try {
  for (const sql of [...RAW_TABLES_SQL,...MERGE_VIEWS_SQL,...setHeadSql(50000)]) await db.run(sql)
  for (let i=0;i<12;i++) {
   await db.run(`INSERT INTO base_entities VALUES ('key${i}','owner${i%2}','creator${i%3}',${49000+i*50},${49100+i*50},${50100+i*3000},NULL,0)`)
   await db.run(`INSERT INTO base_attributes VALUES ('key${i}','type','str','type${i%3}',NULL),('key${i}','status','str','open',NULL),('key${i}','priority','u64','${i%3}',${i%3})`)
  }
  await db.run(DEFAULT_SQL)
  await db.run(ACTIVITY_SQL)
  const byType = VIEWS[0].widgets.find(w=>w.id==='types')!
  await db.run("INSERT INTO base_entities VALUES ('project-only','o','c',49000,49000,90000,NULL,0),('no-label','o','c',49000,49000,90000,NULL,0)")
  await db.run("INSERT INTO base_attributes VALUES ('project-only','project','str','loadtest',NULL)")
  const types = (await db.runAndReadAll(byType.sql)).getRowObjects()
  expect(types.find(r=>r.type==='unlabelled')?.count).toBe(BigInt(1))
  expect(types.find(r=>r.type==='loadtest')?.count).toBe(BigInt(1))
  expect((await db.runAndReadAll(DEFAULT_SQL)).getRowObjects()).toHaveLength(0)
  await db.run("INSERT INTO base_entities VALUES ('ticket','o','c',49000,49000,90000,NULL,0),('comment','o','c',49000,49000,90000,NULL,0)")
  await db.run("INSERT INTO base_attributes VALUES ('ticket','type','str','ticket',NULL),('ticket','status','str','open',NULL),('ticket','priority','u64','1',1),('comment','type','str','comment',NULL),('comment','ticket','key','ticket',NULL)")
  const tickets=(await db.runAndReadAll(DEFAULT_SQL)).getRowObjects()
  expect(tickets).toHaveLength(1); expect(tickets[0].comments).toBe(BigInt(1))
  await db.run("INSERT INTO live_entities VALUES ('key0','new-owner','creator0',49000,50001,100000,NULL,0)")
  await db.run("INSERT INTO live_tombstones VALUES ('key1',50002)")
  const changes=(await db.runAndReadAll(ACTIVITY_SQL)).getRowObjects()
  expect(changes.map(r=>r.kind)).toEqual(['Deleted','Transferred'])
  const ids = VIEWS.flatMap(v=>v.widgets.map(w=>w.id)); expect(new Set(ids).size).toBe(ids.length)
  expect(VIEWS.map(v=>v.id)).toEqual(['overview','expiry','creators','attributes','activity'])
  for (const empty of [false,true]) {
   if(empty) {
    await db.run('DELETE FROM base_entities')
    await db.run('DELETE FROM live_entities')
    await db.run('DELETE FROM live_tombstones')
   }
   for (const widget of VIEWS.flatMap(v=>v.widgets)) {
    const result = await db.runAndReadAll(widget.sql)
    const columns = result.columnNames()
    for(const col of [widget.x,...(Array.isArray(widget.y)?widget.y:[widget.y]),widget.series].filter(Boolean)) expect(columns).toContain(col!)
   }
  }
 } finally { db.closeSync(); instance.closeSync() }
})
