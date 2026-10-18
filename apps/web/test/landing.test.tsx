import { test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { DuckDBInstance } from '../../../packages/core/node_modules/@duckdb/node-api'
import { RAW_TABLES_SQL, MERGE_VIEWS_SQL, MATERIALIZE_SQL, setHeadSql } from '@asi/core'
import { FIGURE_SQL, averageMs, readFigure } from '../components/landing/stats'
import { NAV_ITEMS, isActiveRoute, PageNav } from '../components/dash/TopBar'
import { HeroFigures, Pipeline } from '../components/dash/Hero'

test('each landing figure has its own query over the merged views', async () => {
 const instance = await DuckDBInstance.create(':memory:'); const db = await instance.connect()
 try {
  for (const sql of [...RAW_TABLES_SQL, ...MERGE_VIEWS_SQL, ...setHeadSql(50000)]) await db.run(sql)
  await db.run(`INSERT INTO base_entities VALUES
   ('k1','o','c1',49000,49000,50100,NULL,0,false),
   ('k2','o','c1',40000,40000,60000,NULL,0,false),
   ('k3','o','c2',49999,49999,51800,NULL,0,false),
   ('gone','o','c3',49900,49900,49000,NULL,0,false)`)
  for (const sql of MATERIALIZE_SQL) await db.run(sql)
  const values: Record<string, number | undefined> = {}
  for (const [id, sql] of Object.entries(FIGURE_SQL)) {
   const result = await db.runAndReadAll(sql)
   values[id] = readFigure({ columns: result.columnNames(), rows: result.getRows() as unknown[][] })
  }
  expect(values).toEqual({ live: 3, creators: 2, expiring: 2, created: 2 })
 } finally { db.closeSync(); instance.closeSync() }
})

test('figure values are undefined until a result arrives and null becomes zero', () => {
 expect(readFigure(undefined)).toBeUndefined()
 expect(readFigure({ columns: ['value'], rows: [[BigInt(4)]] })).toBe(4)
 expect(readFigure({ columns: ['value'], rows: [[null]] })).toBe(0)
})

test('average query time ignores figures that have not been measured yet', () => {
 expect(averageMs([])).toBeUndefined()
 expect(averageMs([undefined, undefined])).toBeUndefined()
 expect(averageMs([2, 4, undefined, 3])).toBe(3)
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
 const ready = renderToStaticMarkup(<HeroFigures stats={{ live: 30700, creators: 12, expiring: 0, created: 1500 }} times={{ live: 2.04, creators: 4.4, expiring: 2.6, created: 3.1 }}/>)
 expect(ready).toContain('30.7k'); expect(ready).toContain('12'); expect(ready).toContain('1.5k'); expect(ready).not.toContain('…')
 expect(ready).toContain('2.0 ms'); expect(ready).toContain('4.4 ms')
 expect(ready).toContain('avg 3.0 ms')
 const pipe = renderToStaticMarkup(<Pipeline ms={3.24}/>)
 for (const step of ['Arkiv chain', 'Public logs', 'Indexer', 'Parquet', 'DuckDB']) expect(pipe).toContain(step)
 expect(pipe).toContain('avg 3.2 ms')
 expect(renderToStaticMarkup(<Pipeline/>)).toContain('…')
})
