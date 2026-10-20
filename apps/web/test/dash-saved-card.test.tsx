import { readFileSync } from 'node:fs'
import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { SavedWidgetCard } from '../components/widgets/SavedWidgetCard'
import { widgetQueryPlan } from '../lib/dash/use-widget-query'
import { emptyWidget, type Size } from '../lib/dash/schema'
import { checkWidgetSql } from '../lib/dash/sql-guard'

const payload = { ...emptyWidget(), name: 'Current name', sql: 'SELECT 1 AS n' }
const props = { id: 'slot-1', name: 'Stored name', payload, size: 'md' as const, version: 0 }

test('widget queries require a payload, permission to run and safe SQL', () => {
 expect(widgetQueryPlan(undefined, true)).toEqual({ run: false })
 expect(widgetQueryPlan(null, true)).toEqual({ run: false })
 expect(widgetQueryPlan(payload, false)).toEqual({ run: false })
 const unsafe = { ...payload, sql: 'DELETE FROM merged_entities' }
 expect(widgetQueryPlan(unsafe, true)).toEqual({ run: false, error: checkWidgetSql(unsafe.sql)! })
 expect(widgetQueryPlan(payload, true)).toEqual({ run: true, sql: payload.sql })
})

test('expired cards keep the stored name and explain that nothing runs', () => {
 const html = render(<SavedWidgetCard {...props} status="expired" owner/> )
 expect(html).toContain('Stored name')
 expect(html).toContain('class="state state-stale">Expired')
 expect(html).toContain('This widget is no longer on Arkiv, so nothing runs.')
 expect(html).toContain('Remove it on Organize.')
 expect(html).not.toContain('Current name')
 expect(html).not.toContain('SQL</')
 expect(render(<SavedWidgetCard {...props} status="expired"/>)).not.toContain('Remove it on Organize.')
})

test('query failures stay inside their own live card', () => {
 const html = render(<SavedWidgetCard {...props} status="live" query={{ loading: false, error: 'Query failed here' }}/> )
 expect(html).toContain('class="error"')
 expect(html).toContain('Query failed here')
 const unsafe = { ...payload, sql: 'DELETE FROM merged_entities' }
 expect(render(<SavedWidgetCard {...props} payload={unsafe} status="live"/>)).toContain(checkWidgetSql(unsafe.sql)!)
})

test('saved cards use the specified desktop, mid width and phone spans', () => {
 for (const [size, lg, md] of [['xs', 3, 6], ['sm', 4, 6], ['md', 6, 12], ['xl', 12, 12]] as const) {
  const html = render(<SavedWidgetCard {...props} size={size as Size} status="expired"/> )
  expect(html).toContain(`--lg:${lg};--md:${md};--sm:12`)
 }
})

test('loading slots show a fixed height skeleton instead of SQL or results', () => {
 const html = render(<SavedWidgetCard {...props} status="loading" query={{ loading: false, error: 'Must not show' }}/> )
 expect(html).toContain('aria-busy="true"')
 expect(html).toContain('aria-label="Loading widget"')
 expect(html).toContain('class="skel')
 expect(html).not.toContain('Must not show')
 expect(html).not.toContain('SELECT')
})

test('live cards include timing, expiry and the widget link, without a SQL toggle', () => {
 const html = render(<SavedWidgetCard {...props} status="live" widgetKey="widget-key" expiresAt={43201} head={1} query={{ loading: false, ms: 2, data: { columns: ['n'], rows: [[1]] } }}/> )
 for (const copy of ['class="run"', '1d', 'aria-expanded="false"', 'href="/widgets/widget-key"', 'Open']) expect(html).toContain(copy)
 expect(html).not.toContain('View SQL')
})

test('report figures have captions, lifetime and accessible actions', () => {
 const base = { ...props, status: 'live' as const, figure: 2, widgetKey: 'widget-key', expiresAt: 43201, head: 1, query: { loading: false } }
 expect(readFileSync(new URL('../components/widgets/SavedWidgetCard.tsx', import.meta.url), 'utf8')).toContain('r.figure')
 const html = render(<SavedWidgetCard {...base} subtitle="Imported from someone"/>)
 for (const text of ['Figure 2', 'Stored name', 'Imported from someone', 'Open widget Stored name', 'Actions for Stored name', 'aria-expanded="false"', '1d']) expect(html).toContain(text)
 const kept = render(<SavedWidgetCard {...base} official/>)
 // The one shared KeptLive chip from Explore: green with the clock icon, no glyph characters.
 expect(kept).toContain('chip chip-ok'); expect(kept).toContain('Kept live'); expect(kept).not.toContain('⛨'); expect(kept).not.toContain('chip-official')
 expect(render(<SavedWidgetCard {...base} initialActionsOpen/>)).toContain('data-actions-open="true"')
 expect(render(<SavedWidgetCard {...base} payload={{ ...payload, chart: 'counter' }}/>)).not.toContain('Figure 2')
})
