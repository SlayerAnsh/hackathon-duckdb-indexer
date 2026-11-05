import { expect, test } from 'bun:test'
import { DuckDBInstance } from '@duckdb/node-api'
import { RAW_TABLES_SQL, MERGE_VIEWS_SQL, MATERIALIZE_SQL, setHeadSql } from '@asi/core'
import { isOfficialUser, isOfficialOwned, officialExpr } from '../lib/dash/official'
import { OFFICIAL_DASHBOARDS } from '../lib/dash/official-defs'
import { parseDashboardPayload, parseWidgetPayload } from '../lib/dash/schema'
import { dashCte } from '../lib/dash/sql'
import { W, U } from './dash-fakes'

test('official marker validates addresses and scopes the publisher and project', () => {
  expect(isOfficialUser(W, W.toUpperCase().replace('0X', '0x'))).toBe(true)
  expect(isOfficialUser(U, W)).toBe(false)
  expect(isOfficialUser('nope', W)).toBe(false)
  expect(isOfficialUser(W, 'nope')).toBe(false)
  const expr = officialExpr(W).toLowerCase()
  expect(expr).toContain(`$creator = addr(${W})`)
  expect(expr).toContain("project = str('arkiv-sql-indexer-dash')")
  expect(expr).toContain(`user = addr(${W})`)
  expect(dashCte(W)).toContain('AS slug')
})

test('official definitions validate without normalization', () => {
  expect(OFFICIAL_DASHBOARDS.map(d => d.slug)).toEqual(['network-overview', 'expiry-watch', 'creators', 'attributes', 'activity'])
  const charts = new Set<string>()
  for (const d of OFFICIAL_DASHBOARDS) {
    expect(d.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(parseDashboardPayload({ v: 1, title: d.title, description: d.description }).ok).toBe(true)
    expect(d.widgets.length).toBeLessThanOrEqual(48)
    for (const { widget } of d.widgets) {
      expect(parseWidgetPayload(widget)).toEqual({ ok: true, value: widget })
      expect(widget.lifetimeDays).toBe(90)
      charts.add(widget.chart)
    }
  }
  expect(charts.has('stacked-bar')).toBe(true)
  expect(charts.has('histogram')).toBe(true)
})

test('every official query executes on populated and empty public views with mapped columns', async () => {
  const instance = await DuckDBInstance.create(':memory:'); const db = await instance.connect()
  try {
    for (const sql of [...RAW_TABLES_SQL, ...MERGE_VIEWS_SQL, ...setHeadSql(50000)]) await db.run(sql)
    for (let i = 0; i < 12; i++) {
      await db.run(`INSERT INTO base_entities VALUES ('key${i}','owner${i%2}','creator${i%3}',${49000+i*50},${49100+i*50},${50100+i*3000},NULL,0,false)`)
      await db.run(`INSERT INTO base_attributes VALUES ('key${i}','type','str','type${i%3}',NULL),('key${i}','status','str','open',NULL),('key${i}','priority','u64','${i%3}',${i%3})`)
    }
    for (const empty of [false, true]) {
      if (empty) { await db.run('DELETE FROM base_entities'); await db.run('DELETE FROM base_attributes') }
      for (const sql of MATERIALIZE_SQL) await db.run(sql)
      for (const { widget } of OFFICIAL_DASHBOARDS.flatMap(d => d.widgets)) {
        const result = await db.runAndReadAll(widget.sql)
        for (const col of [widget.counter?.column, widget.mapping.x, ...widget.mapping.y, widget.mapping.groupBy].filter(Boolean)) {
          expect(result.columnNames()).toContain(col!)
        }
        if (widget.chart === 'counter') expect(result.columnNames()).toEqual(['value'])
      }
    }
  } finally { db.closeSync(); instance.closeSync() }
})

test('official ownership requires both author and owner', () => {
 expect(isOfficialOwned(W, W, W)).toBe(true)
 expect(isOfficialOwned(W, U, W)).toBe(false)
 expect(isOfficialOwned(U, W, W)).toBe(false)
 expect(isOfficialOwned('nope', W, W)).toBe(false)
 expect(officialExpr(W).toLowerCase()).toContain(`$owner = addr(${W})`)
})
