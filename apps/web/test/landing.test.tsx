import { test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { DuckDBInstance } from '../../../packages/core/node_modules/@duckdb/node-api'
import { RAW_TABLES_SQL, MERGE_VIEWS_SQL, MATERIALIZE_SQL, setHeadSql } from '@asi/core'
import { LANDING_STATS_SQL, readLandingStats } from '../components/landing/stats'
import { NAV_ITEMS, isActiveRoute, PageNav } from '../components/dash/TopBar'
import { HeroFigures, Pipeline } from '../components/dash/Hero'

test('landing stats query returns live, creators, expiring and new counts in one row', async () => {
 const instance = await DuckDBInstance.create(':memory:'); const db = await instance.connect()
 try {
  for (const sql of [...RAW_TABLES_SQL, ...MERGE_VIEWS_SQL, ...setHeadSql(50000)]) await db.run(sql)
  await db.run(`INSERT INTO base_entities VALUES
   ('k1','o','c1',49000,49000,50100,NULL,0,false),
   ('k2','o','c1',40000,40000,60000,NULL,0,false),
   ('k3','o','c2',49999,49999,51800,NULL,0,false),
   ('gone','o','c3',49900,49900,49000,NULL,0,false)`)
  for (const sql of MATERIALIZE_SQL) await db.run(sql)
  const result = await db.runAndReadAll(LANDING_STATS_SQL)
  const columns = result.columnNames()
  const rows = result.getRows() as unknown[][]
  expect(readLandingStats({ columns, rows })).toEqual({ live: 3, creators: 2, expiring: 2, created: 2 })
 } finally { db.closeSync(); instance.closeSync() }
})

test('landing stats are undefined until a result arrives and null values become zero', () => {
 expect(readLandingStats(undefined)).toBeUndefined()
 expect(readLandingStats({ columns: ['live', 'creators', 'expiring', 'created'], rows: [[BigInt(4), 2, null, '1']] })).toEqual({ live: 4, creators: 2, expiring: 0, created: 1 })
})

test('nav marks exactly the active route', () => {
 expect(NAV_ITEMS.map(i => i.href)).toEqual(['/', '/showcase', '/playground'])
 expect(isActiveRoute('/', '/')).toBe(true)
 expect(isActiveRoute('/showcase', '/')).toBe(false)
 expect(isActiveRoute('/showcase', '/showcase')).toBe(true)
 expect(isActiveRoute('/showcase/', '/showcase')).toBe(true)
 expect(isActiveRoute('/showcases', '/showcase')).toBe(false)
 expect(isActiveRoute(null, '/')).toBe(false)
 const html = renderToStaticMarkup(<PageNav pathname="/playground"/>)
 expect(html.match(/aria-current="page"/g)).toHaveLength(1)
 expect(html).toMatch(/aria-current="page"[^>]*href="\/playground"|href="\/playground"[^>]*aria-current="page"/)
 expect(html).toContain('Overview'); expect(html).toContain('Showcase'); expect(html).toContain('Playground')
})

test('hero figures show placeholders while loading and the pipeline shows the measured time', () => {
 const loading = renderToStaticMarkup(<HeroFigures/>)
 expect(loading).toContain('Live entities'); expect(loading).toContain('…')
 const ready = renderToStaticMarkup(<HeroFigures stats={{ live: 30700, creators: 12, expiring: 0, created: 1500 }}/>)
 expect(ready).toContain('30.7k'); expect(ready).toContain('12'); expect(ready).toContain('1.5k'); expect(ready).not.toContain('…')
 const pipe = renderToStaticMarkup(<Pipeline ms={3.24}/>)
 for (const step of ['Arkiv chain', 'Public logs', 'Indexer', 'Parquet', 'DuckDB']) expect(pipe).toContain(step)
 expect(pipe).toContain('3.2 ms')
 expect(renderToStaticMarkup(<Pipeline/>)).toContain('…')
})
