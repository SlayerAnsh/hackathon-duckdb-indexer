import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { organizeReducer, isDirty, toOrganizeInput, type OrganizeDraft } from '../lib/dash/organize-state'
import { DashboardBrowseCard } from '../components/explore/DashboardBrowseCard'
import { OFFICIAL_DASHBOARDS } from '../lib/dash/official-defs'
import { dashboardListSql, toDashboardItems } from '../lib/dash/sql'
import { DASH_PROJECT, emptyWidget } from '../lib/dash/schema'
import { nativeDb } from './dash-duckdb'
const k = (n: number) => '0x' + n.toString(16).padStart(64, '0')
const wallet = '0x' + '11'.repeat(20)
test('one star moves, toggles off, clears on removal and dirties the draft', () => {
 const draft = { title: 'A', cover: null, items: [{ id: 'a', widget: k(1), expired: false }, { id: 'b', widget: k(2), expired: false }] } as OrganizeDraft
 const a = organizeReducer(draft, { type: 'star', key: k(1) })
 expect(a.cover).toBe(k(1)); expect(isDirty(a, draft)).toBe(true)
 expect(toOrganizeInput(a, draft).cover).toBe(k(1))
 const b = organizeReducer(a, { type: 'star', key: k(2) })
 expect(b.cover).toBe(k(2))
 expect(organizeReducer(b, { type: 'star', key: k(2) }).cover).toBeNull()
 expect(organizeReducer(b, { type: 'remove', id: 'b' }).cover).toBeNull()
})
test('SQL accepts only a linked widget from the scoped creator and project', async () => {
 const common = { project: DASH_PROJECT, user: wallet }
 const rows = [
  { key: k(1), creator: wallet, attrs: { ...common, type: 'dashboard', title: 'A', cover: k(3) } },
  { key: k(2), creator: wallet, attrs: { ...common, type: 'link', dashboard: k(1), widget: k(3) } },
  { key: k(3), creator: wallet, attrs: { ...common, type: 'widget', chart: 'bar' } },
 ]
 const fixture = await nativeDb(rows)
 try {
  const sql = dashboardListSql(wallet, { search: '', sort: 'newest', official: false, limit: 12, offset: 0 })
  const read = async () => toDashboardItems((await fixture.db.runAndReadAll(sql)).getRows())[0]!.cover
  expect(await read()).toBe(k(3))
  await fixture.db.run(`DELETE FROM attributes WHERE key = '${k(2)}'`)
  expect(await read()).toBeNull()
  await fixture.db.run(`DELETE FROM attributes WHERE name = 'cover'`)
  expect(await read()).toBeNull()
 } finally { fixture.close() }
})
test('official cover indices resolve to their intended widgets', () => {
 expect(OFFICIAL_DASHBOARDS.map(d => d.widgets[d.cover!]?.widget.name)).toEqual(['Creations per hour', 'Expiry horizon', 'Top 10 creators', 'Top status values', 'Running count of creations'])
})
test('card renders resolved cover preview and falls back to at most four icons', () => {
 const item = toDashboardItems([[k(1), 'A', wallet, false, 5, ['bar','line','area','donut','table'], 1, 2, 100, k(3)]])[0]!
 const payload = { key: k(3), widget: { ...emptyWidget(), chart: 'counter', counter: { column: 'value', row: 0, prefix: '', suffix: '', label: '', decimals: 0, compact: false } } } as any
 const props = { item, coverPayload: payload, visibleOverride: true, query: { loading: false, data: { columns: ['value'], rows: [[12]] } } }
 expect(render(<DashboardBrowseCard {...props}/>)).toContain('data-cover-preview')
 expect(render(<DashboardBrowseCard {...props} query={{ loading: false, error: 'bad' }}/>)).toContain('data-cover-icons')
 expect(render(<DashboardBrowseCard item={{ ...item, cover: null }}/>)).toContain('data-cover-icons')
})

test('SQL ignores missing widgets, foreign creators, foreign projects and forged link users', async () => {
 for (const variant of ['missing', 'creator', 'project', 'user']) {
  const common = { project: DASH_PROJECT, user: wallet }
  const fixture = await nativeDb([
   { key: k(1), creator: wallet, attrs: { ...common, type: 'dashboard', title: 'A', cover: k(3) } },
   { key: k(2), creator: wallet, attrs: { ...common, user: variant === 'user' ? '0x' + '22'.repeat(20) : wallet, type: 'link', dashboard: k(1), widget: k(3) } },
   ...(variant === 'missing' ? [] : [{ key: k(3), creator: variant === 'creator' ? '0x' + '22'.repeat(20) : wallet, attrs: { ...common, project: variant === 'project' ? 'other' : DASH_PROJECT, type: 'widget', chart: 'bar' } }]),
  ])
  try {
   const rows = (await fixture.db.runAndReadAll(dashboardListSql(wallet, { search: '', sort: 'newest', official: false, limit: 12, offset: 0 }))).getRows()
   expect(toDashboardItems(rows)[0]!.cover).toBeNull()
  } finally { fixture.close() }
 }
})

test('cover loading, empty result, wrong payload key and offscreen states keep the card intact', () => {
 const item = toDashboardItems([[k(1), 'A', wallet, false, 1, ['bar'], 1, 2, 100, k(3)]])[0]!
 const payload = { key: k(3), widget: emptyWidget() } as any
 expect(render(<DashboardBrowseCard item={item} visibleOverride/>)).toContain('data-skeleton')
 expect(render(<DashboardBrowseCard item={item} coverPayload={payload} visibleOverride query={{ loading: true }}/>)).toContain('data-skeleton')
 for (const props of [
  { visibleOverride: false, coverPayload: payload },
  { visibleOverride: true, coverPayload: { ...payload, key: k(4) } },
  { visibleOverride: true, coverPayload: payload, query: { loading: false, data: { columns: ['x'], rows: [] } } },
 ]) expect(render(<DashboardBrowseCard item={item} {...props}/>)).toContain('data-cover-icons')
})

test('organize header exposes one accessible star toggle and owner figures can display its marker', async () => {
 const { OrganizeTileHeader } = await import('../components/widgets/OrganizeRow')
 const { SavedWidgetCard } = await import('../components/widgets/SavedWidgetCard')
 const header = render(<OrganizeTileHeader item={{ name: 'A', expired: false } as any} starred index={0} count={1} onRemove={() => {}} onStar={() => {}}/>)
 expect(header).toContain('aria-pressed="true"')
 expect(header).toContain('data-tip="Cover widget"')
 expect(header).toContain('Remove A')
 const props = { id: 'a', name: 'A', status: 'live' as const, size: 'md' as const, version: 1, payload: emptyWidget(), query: { loading: false, data: { columns: ['x'], rows: [] } } }
 expect(render(<SavedWidgetCard {...props} owner starred/>)).toContain('aria-label="Cover widget"')
 expect(render(<SavedWidgetCard {...props}/>)).not.toContain('aria-label="Cover widget"')
 const item = toDashboardItems([[k(1), 'A', wallet, false, 5, ['bar','line','area','donut','table'], 1, 2, 100, null]])[0]!
 expect((render(<DashboardBrowseCard item={item}/>).match(/<svg/g) ?? []).length).toBe(4)
})
