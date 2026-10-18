import { test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { VIEWS, type Widget } from '../lib/views'
import { baseSpan, packRow, cardSpans } from '../components/showcase/layout'
import { viewFromSearch, searchForView } from '../components/showcase/view-state'
import { decodeSqlHash } from '../lib/hash-state'

const w = (kind: Widget['kind'], span?: 1 | 2 | 3): Widget => ({ id: kind + (span ?? ''), title: 't', sql: 'SELECT 1', kind, span })

test('base spans: stats small, charts half, tables and wide charts full', () => {
 expect(baseSpan(w('stat'))).toBe(4)
 expect(baseSpan(w('area', 2))).toBe(6)
 expect(baseSpan(w('donut'))).toBe(6)
 expect(baseSpan(w('table'))).toBe(12)
 expect(baseSpan(w('table', 1))).toBe(12)
 expect(baseSpan(w('area', 3))).toBe(12)
 expect(baseSpan(w('stacked-bar', 3))).toBe(12)
})

test('rows are packed so every row fills all twelve columns', () => {
 expect(packRow([6, 4])).toEqual([6, 6])
 expect(packRow([4, 4, 4, 4, 4, 4])).toEqual([4, 4, 4, 4, 4, 4])
 expect(packRow([4, 4, 4, 4])).toEqual([4, 4, 4, 12])
 expect(packRow([4, 4, 4, 4, 4])).toEqual([4, 4, 4, 6, 6])
 expect(packRow([6, 12, 6, 6])).toEqual([12, 12, 6, 6])
 expect(packRow([6, 4, 4])).toEqual([6, 6, 12])
 expect(packRow([])).toEqual([])
})

test('every view lays out into full rows on desktop and tablet', () => {
 for (const view of VIEWS) {
  const spans = cardSpans(view.widgets)
  expect(spans).toHaveLength(view.widgets.length)
  for (const key of ['lg', 'md', 'sm'] as const) {
   let used = 0
   for (const s of spans) { expect(s[key]).toBeGreaterThan(0); expect(s[key]).toBeLessThanOrEqual(12); if (used + s[key] > 12) { expect(used).toBe(12); used = 0 } used += s[key] }
   expect(used).toBe(12)
  }
  view.widgets.forEach((widget, i) => { if (widget.kind === 'table') expect(spans[i].lg).toBe(12); if (widget.kind !== 'stat' && widget.kind !== 'table') expect(spans[i].lg).toBeGreaterThanOrEqual(6); expect([widget.kind === 'stat' ? 4 : 6, 6, 12]).toContain(spans[i].md) })
 }
})

test('stat cards sit three to a row on tablet and two on phones; other cards fill the row on phones', () => {
 const overview = cardSpans(VIEWS[0].widgets)
 VIEWS[0].widgets.forEach((widget, i) => {
  if (widget.kind === 'stat') expect(overview[i]).toEqual({ lg: 4, md: 4, sm: 6 })
  else expect(overview[i].sm).toBe(12)
 })
 expect(cardSpans([w('area', 2), w('stat')])).toEqual([{ lg: 6, md: 6, sm: 12 }, { lg: 6, md: 6, sm: 12 }])
})

test('view state is read from and written to the query string', () => {
 expect(viewFromSearch('')).toBe(VIEWS[0].id)
 expect(viewFromSearch('?view=expiry')).toBe('expiry')
 expect(viewFromSearch('view=creators&x=1')).toBe('creators')
 expect(viewFromSearch('?view=nope')).toBe(VIEWS[0].id)
 expect(viewFromSearch(new URLSearchParams('view=activity'))).toBe('activity')
 expect(searchForView('', 'expiry')).toBe('?view=expiry')
 expect(searchForView('?view=expiry&x=1', 'creators')).toBe('?view=creators&x=1')
 expect(searchForView('?view=expiry', VIEWS[0].id)).toBe('')
 expect(searchForView('?x=1&view=expiry', VIEWS[0].id)).toBe('?x=1')
 expect(searchForView('', 'nope')).toBe('')
})

test('widget card footer links to the playground with the encoded SQL', async () => {
 const { WidgetCard } = await import('../components/dash/WidgetCard')
 const widget = VIEWS[1].widgets[0]
 const html = renderToStaticMarkup(<WidgetCard widget={widget} version={0}/>)
 const href = /href="\/playground#([^"]+)"/.exec(html)?.[1]
 expect(href).toBeDefined()
 expect(decodeSqlHash(href!.replaceAll('&amp;', '&'))).toBe(widget.sql)
 expect(html).toContain('Open in playground')
 expect(html).toContain('View SQL')
 expect(html).toContain(widget.notInArkivQuery!)
})

test('stat card renders label, value, context note and meter from the measured row', async () => {
 const { WidgetBody } = await import('../components/dash/WidgetCard')
 const widget = VIEWS[0].widgets.find(x => x.id === 'ownership-transfers')!
 const html = renderToStaticMarkup(<WidgetBody widget={widget} query={{ loading: false, ms: 2, data: { columns: ['value', 'total'], rows: [[11, 30]] } }}/>)
 expect(html).toContain('>11<')
 expect(html).toContain('36.7% of live entities')
 expect(html).toContain('role="meter"')
 expect(html).toContain('aria-valuenow="36.7"')
 const empty = renderToStaticMarkup(<WidgetBody widget={widget} query={{ loading: false, ms: 2, data: { columns: ['value', 'total'], rows: [[0, 0]] } }}/>)
 expect(empty).not.toContain('NaN')
 expect(empty).not.toContain('role="meter"')
})
