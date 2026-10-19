import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { nativeDb } from './dash-duckdb'
import { DASH_PROJECT, emptyWidget } from '../lib/dash/schema'
import { widgetListSql, widgetCountSql, type WidgetListQuery } from '../lib/dash/sql'
import { toListItems } from '../lib/dash/use-widget-list'
import { WidgetBrowseCard } from '../components/widgets/WidgetBrowseCard'

const W = '0x' + 'ab'.repeat(20), U = '0x' + 'cd'.repeat(20), V = '0x' + 'ef'.repeat(20)
const key = (n: number) => '0x' + n.toString(16).padStart(64, '0')
const q: WidgetListQuery = { search: '', chart: null, sort: 'newest', user: null, limit: 12, offset: 0 }
test('browse SQL scopes, searches literal text, filters, sorts and pages in DuckDB', async () => {
 const base = { project: DASH_PROJECT, user: U }
 const widgets = ['Top creators', 'Top_owners', 'Expiry', '50% done'].map((name, i) => ({ key: key(i + 1), creator: W, created_at: i < 2 ? 4 : i, expires_at: 100 - i, attrs: { ...base, type: 'widget', name, chart: i % 2 ? 'donut' : 'bar', user: i === 3 ? V : U } }))
 const { db, close } = await nativeDb([...widgets,
  { ...widgets[0]!, key: key(9), creator: V },
  ...[1, 2, 2, 3, 3, 3].map((n, i) => ({ key: key(20 + i), creator: W, attrs: { ...base, type: 'link', widget: key(n), dashboard: key(40 + i) } })),
  { key: key(50), creator: V, attrs: { ...base, type: 'link', widget: key(1), dashboard: key(60) } },
  { ...widgets[0]!, key: key(70), attrs: { ...widgets[0]!.attrs, project: 'foreign' } },
 ])
 const rows = async (patch: Partial<WidgetListQuery> = {}) => (await db.runAndReadAll(widgetListSql(W, { ...q, ...patch }))).getRowObjects()
 const keys = async (patch: Partial<WidgetListQuery> = {}) => (await rows(patch)).map(r => r.key)
 try {
  expect(await keys()).toEqual([key(1), key(2), key(4), key(3)])
  expect(await keys({ sort: 'used' })).toEqual([key(3), key(2), key(1), key(4)])
  expect(await keys({ sort: 'expiring' })).toEqual([key(4), key(3), key(2), key(1)])
  expect(await keys({ chart: 'donut' })).toEqual([key(2), key(4)])
  expect(await keys({ user: V })).toEqual([key(4)])
  for (const [search, expected] of [['top', [key(1), key(2)]], ['_', [key(2)]], ['%', [key(4)]], ["x' OR '1'='1", []], ['0xCD', [key(1), key(2), key(3)]], ['\\', []]] as const) {
   expect(await keys({ search })).toEqual([...expected])
   const count = (await db.runAndReadAll(widgetCountSql(W, { search, chart: null, user: null }))).getRowObjects()
   expect(Number(count[0]!.n)).toBe(expected.length)
  }
  expect(await keys({ limit: 2, offset: 2 })).toEqual([key(4), key(3)])
  expect(Number((await rows())[0]!.uses)).toBe(1)
 } finally { close() }
})
test('list rows convert numeric fields and lowercase keys and owners', () => {
 expect(toListItems([[key(10).toUpperCase(), 'Name', 'bar', U.toUpperCase(), BigInt(100), '20', BigInt(12)]])).toEqual([{ key: key(10), name: 'Name', chart: 'bar', user: U, expiresAt: 100, createdAt: 20, uses: 12 }])
 for (const build of [() => widgetListSql('bad', q), () => widgetCountSql(W, { search: '', chart: null, user: 'bad' }), () => widgetListSql(W, { ...q, limit: -1 })]) expect(build).toThrow()
})
const item = { key: key(1), name: 'Top creators', chart: 'bar' as const, user: U, expiresAt: 43201, createdAt: 1, uses: 12 }
const props = { item, head: 1, version: 0, variant: 'explorer' as const }
test('explorer cards show metadata, expiry and actions', () => {
 const html = render(<WidgetBrowseCard {...props} payload={null} visibleOverride/> )
 for (const text of ['Top creators', 'Bar', 'by ', 'on 12 dashboards', '1d', 'Open', 'href="/widgets/' + key(1) + '"', '+ Add to dashboard', 'Preview unavailable', 'height:160px']) expect(html).toContain(text)
 expect(render(<WidgetBrowseCard {...props} item={{ ...item, uses: 1 }} payload={null}/>)).toContain('on 1 dashboard')
})
test('preview states include loading, offscreen placeholder and muted errors', () => {
 expect(render(<WidgetBrowseCard {...props} payload={undefined} visibleOverride/>)).toContain('aria-label="Loading preview"')
 const html = render(<WidgetBrowseCard {...props} payload={null} visibleOverride={false}/> )
 expect(html).toContain('width="32"'); expect(html).toContain('opacity:0.3')
 expect(html).not.toContain('Loading preview'); expect(html).not.toContain('Preview unavailable')
 const payload = { widget: { ...emptyWidget(), sql: 'DELETE FROM merged_entities' } } as any
 expect(render(<WidgetBrowseCard {...props} payload={payload} visibleOverride/>)).toContain('Preview unavailable')
 expect(render(<WidgetBrowseCard {...props} payload={payload} visibleOverride={false}/>)).not.toContain('Preview unavailable')
})
test('pick cards expose selection and disable already placed widgets', () => {
 const html = render(<WidgetBrowseCard {...props} variant="pick" payload={null} selected/> )
 expect(html).toContain('aria-pressed="true"'); expect(html).toContain('height:120px')
 expect(render(<WidgetBrowseCard {...props} variant="pick" payload={null}/>)).toContain('aria-pressed="false"')
 const disabled = render(<WidgetBrowseCard {...props} variant="pick" payload={null} disabled/> )
 expect(disabled).toContain('Already on this dashboard'); expect(disabled).not.toContain('aria-pressed'); expect(disabled).not.toContain('role="button"')
})

import { showLoading } from '../lib/dash/loading'
import { scheduleDebounced } from '../lib/dash/use-debounced'
import { WidgetPayloadError } from '../components/widgets/WidgetPayloadError'
import { RpcError } from '@asi/core'
import { rpcMessage } from '../components/RowActions'
test('refresh keeps existing results visible', () => {
 expect(showLoading({ loading: true, data: null })).toBe(true)
 expect(showLoading({ loading: true, data: [] })).toBe(false)
 expect(showLoading({ loading: false, data: null })).toBe(false)
 const payload = { widget: { ...emptyWidget(), chart: 'counter', counter: { column: 'n', row: 0, prefix: '', suffix: '', label: 'Total', decimals: 0, compact: false } } } as any
 const html = render(<WidgetBrowseCard {...props} payload={payload} visibleOverride query={{ loading: true, data: { columns: ['n'], rows: [[42]] } }}/>)
 expect(html).toContain('42')
 expect(html).not.toContain('Loading preview')
})
test('search debounce waits 250 ms and cancels stale input', () => {
 let now = 0, value = '', jobs: { at: number; run(): void }[] = []
 const scheduler = { set(run: () => void, ms: number) { const job = { at: now + ms, run }; jobs.push(job); return job }, clear(job: unknown) { jobs = jobs.filter(j => j !== job) } }
 const cancel = scheduleDebounced(() => { value = 'a' }, scheduler)
 now = 100; cancel()
 scheduleDebounced(() => { value = 'ab' }, scheduler)
 now = 349; jobs.filter(j => j.at <= now).forEach(j => j.run()); expect(value).toBe('')
 now = 350; jobs.filter(j => j.at <= now).forEach(j => j.run()); expect(value).toBe('ab')
})
test('payload failures show the shared RPC message and optional retry', () => {
 const error = new RpcError('limited', 429, 'limited', '60')
 const html = render(<WidgetPayloadError error={rpcMessage(error)} onRetry={() => {}}/>)
 expect(html).toContain('RPC budget exhausted, retry later')
 expect(html).toContain('Try again')
 expect(html).toContain('btn-quiet')
})

import { readFileSync } from 'node:fs'
test('explorer and import share the tested debounce and render payload failures', () => {
 for (const file of ['ExplorerGrid', 'ImportModal']) {
  const source = readFileSync(new URL(`../components/widgets/${file}.tsx`, import.meta.url), 'utf8')
  expect(source).toContain('useDebounced(search)')
  expect(source).toContain('<WidgetPayloadError error={list.payloadError}/>')
 }
 const modal = readFileSync(new URL('../components/widgets/ImportModal.tsx', import.meta.url), 'utf8')
 expect(modal).toContain('value={search} onChange={event => setSearch(event.target.value)}')
 expect(modal).toContain("search: state.search")
})

test('official widget cards use official author and kept live', () => {
 const html = render(<WidgetBrowseCard item={{ key: key(1), name: 'Official widget', chart: 'bar', user: W, expiresAt: 100, createdAt: 1, uses: 2 }} payload={undefined} version={0} variant="explorer" official/>)
 expect(html).toContain('Official')
 expect(html).toContain('Arkiv SQL Indexer')
 expect(html).toContain('Kept live')
 expect(html).not.toContain('Extend')
})
