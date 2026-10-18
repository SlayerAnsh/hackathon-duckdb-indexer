import { test, expect } from 'bun:test'
import { TIME_RANGES, VIEWS, rangeOf, resolveWidget, widgetSql, bucketTimeLabel } from '../lib/views'
import { rangeFromSearch, searchForRange } from '../components/showcase/view-state'

const creations = VIEWS[0].widgets.find(w => w.id === 'creations')!
const updates = VIEWS.flatMap(v => v.widgets).find(w => w.id === 'updates')!

test('ranges use two second blocks and keep roughly 24 to 60 buckets', () => {
 expect(TIME_RANGES.map(r => [r.id, r.blocks, r.bucket])).toEqual([['30m', 900, 30], ['5h', 9000, 300], ['24h', 43200, 1800], ['7d', 302400, 10800], ['30d', 1296000, 43200]])
 for (const r of TIME_RANGES) { expect(r.blocks / r.bucket).toBeGreaterThanOrEqual(24); expect(r.blocks / r.bucket + 1).toBeLessThanOrEqual(60) }
})

test('creations default to 24 h and the title and subtitle follow the range', () => {
 expect(rangeOf(creations)?.id).toBe('24h')
 expect(creations.sql).toBe(widgetSql(creations, '24h'))
 const fiveHours = resolveWidget(creations, '5h')
 expect(fiveHours.title).toBe('Creations per 10 min')
 expect(fiveHours.subtitle).toBe('Last 5 hours · live entities only')
 expect(fiveHours.sql).toContain('300')
 expect(fiveHours.sql).toContain('9000')
 expect(resolveWidget(creations, '7d').subtitle).toBe('Last 7 days · live entities only')
 expect(resolveWidget(creations, 'nope').title).toBe('Creations per hour')
 expect(rangeOf(updates)).toBeDefined()
 const plain = VIEWS[0].widgets.find(w => w.id === 'types')!
 expect(widgetSql(plain, '5h')).toBe(plain.sql)
 expect(resolveWidget(plain, '5h')).toBe(plain)
})

test('time labels show time of day for short ranges and dates for long ones', () => {
 const now = new Date(2026, 9, 19, 12, 0).getTime()
 const head = 100000
 const at = (id: string, block: number) => bucketTimeLabel(block, head, TIME_RANGES.find(r => r.id === id)!, now)
 expect(at('30m', head - 30)).toBe('11:59')
 expect(at('5h', head - 300)).toBe('11:50')
 expect(at('24h', head - 1800)).toBe('11:00')
 expect(at('7d', head - 43200)).toBe('18 Oct 12:00')
 expect(at('30d', head - 43200 * 3)).toBe('16 Oct')
})

test('selected range lives in the query string under the card id and drops the default', () => {
 expect(rangeFromSearch('?view=overview&creations=5h', creations)).toBe('5h')
 expect(rangeFromSearch('?creations=nope', creations)).toBe('24h')
 expect(rangeFromSearch('', creations)).toBe('24h')
 expect(searchForRange('?view=overview', creations, '5h')).toBe('?view=overview&creations=5h')
 expect(searchForRange('?view=overview&creations=5h', creations, '24h')).toBe('?view=overview')
 expect(searchForRange('?creations=5h', creations, '24h')).toBe('')
})
