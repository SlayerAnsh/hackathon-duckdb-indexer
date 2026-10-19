import { expect, test } from 'bun:test'
import { parseWidgetPayload, parseDashboardPayload, parseLinkPayload, defaultSize, SIZE_SPAN, emptyWidget, isEntityKey, isHexAddress, type ChartType, type WidgetPayload } from '../lib/dash/schema'

const valid: WidgetPayload = { v: 1, name: 'Top 10 creators', sql: 'SELECT creator, count(*) AS n FROM entities GROUP BY 1 ORDER BY n DESC LIMIT 10',
  chart: 'hbar', mapping: { x: 'creator', y: ['n'], groupBy: null, stacking: 'off', sort: 'query' }, counter: null,
  format: { number: '0,0', xTitle: null, yTitle: null, legend: true, labels: false, colors: {} }, lifetimeDays: 7 }

test('accepts the spec example and strips unknown keys', () => {
  const r = parseWidgetPayload({ ...valid, extra: 1, mapping: { ...valid.mapping, junk: true } })
  expect(r).toEqual({ ok: true, value: valid })
})
test('trims the name and rejects empty, long, control characters and over 128 UTF-8 bytes', () => {
  expect(parseWidgetPayload({ ...valid, name: '  Hi  ' })).toMatchObject({ ok: true, value: { name: 'Hi' } })
  for (const name of ['', '   ', 'x'.repeat(81), 'a\u0000b', 'é'.repeat(65)]) expect(parseWidgetPayload({ ...valid, name }).ok).toBe(false)
})
test('enforces enums', () => {
  for (const patch of [{ chart: 'scatter' }, { lifetimeDays: 14 }, { v: 2 }, { format: { ...valid.format, number: '0.000' } },
    { mapping: { ...valid.mapping, stacking: 'sideways' } }, { mapping: { ...valid.mapping, sort: 'random' } },
    { format: { ...valid.format, colors: { n: 'red' } } }]) expect(parseWidgetPayload({ ...valid, ...patch }).ok).toBe(false)
})
test('groupBy and several Y columns are mutually exclusive, Y has at most 8 columns', () => {
  expect(parseWidgetPayload({ ...valid, mapping: { ...valid.mapping, y: ['a', 'b'], groupBy: 'c' } }).ok).toBe(false)
  expect(parseWidgetPayload({ ...valid, mapping: { ...valid.mapping, y: Array.from({ length: 9 }, (_, i) => 'c' + i) } }).ok).toBe(false)
  expect(parseWidgetPayload({ ...valid, mapping: { ...valid.mapping, y: ['n'], groupBy: 'creator' } }).ok).toBe(true)
})
test('counter config is required for counter charts and null otherwise', () => {
  const counter = { column: 'n', row: 0, prefix: '', suffix: ' rows', label: 'Live', decimals: 0, compact: true }
  expect(parseWidgetPayload({ ...valid, chart: 'counter', counter }).ok).toBe(true)
  expect(parseWidgetPayload({ ...valid, chart: 'counter', counter: null }).ok).toBe(false)
  expect(parseWidgetPayload({ ...valid, counter }).ok).toBe(false)
  expect(parseWidgetPayload({ ...valid, chart: 'counter', counter: { ...counter, decimals: 7 } }).ok).toBe(false)
})
test('sql length and serialized size caps', () => {
  expect(parseWidgetPayload({ ...valid, sql: 'SELECT 1 ' + ' '.repeat(10000) }).ok).toBe(false)
  expect(parseWidgetPayload({ ...valid, sql: '   ' }).ok).toBe(false)
})
test('uses the injected SQL check', () => {
  expect(parseWidgetPayload(valid, () => 'nope')).toEqual({ ok: false, error: 'nope' })
})
test('dashboard and link payloads', () => {
  expect(parseDashboardPayload({ v: 1, title: ' Top creators ' })).toEqual({ ok: true, value: { v: 1, title: 'Top creators', description: '' } })
  expect(parseDashboardPayload({ v: 1, title: 'x', description: 'd'.repeat(501) }).ok).toBe(false)
  expect(parseLinkPayload({ v: 1, size: 'xl', position: 3, name: 'Top 10 creators' }).ok).toBe(true)
  for (const bad of [{ size: 'lg' }, { position: -1 }, { position: 1.5 }]) expect(parseLinkPayload({ v: 1, size: 'xl', position: 3, name: 'n', ...bad }).ok).toBe(false)
})
test('defaults and helpers', () => {
  expect(['counter', 'donut', 'bar', 'table'].map(c => defaultSize(c as ChartType))).toEqual(['xs', 'sm', 'md', 'md'])
  expect(SIZE_SPAN).toEqual({ xs: 3, sm: 4, md: 6, xl: 12 })
  expect(emptyWidget()).toMatchObject({ v: 1, chart: 'table', lifetimeDays: 7, mapping: { y: [], stacking: 'off', sort: 'query' } })
  expect(isEntityKey('0x' + 'ab'.repeat(32))).toBe(true); expect(isHexAddress('0x' + 'ab'.repeat(32))).toBe(false)
})

test('rejects malformed fields and bounds nested settings', () => {
  for (const input of [null, [], 'widget', 1, { ...valid, mapping: null }, { ...valid, format: [] },
    { ...valid, mapping: { ...valid.mapping, x: '', y: ['n'] } },
    { ...valid, mapping: { ...valid.mapping, y: ['c'.repeat(129)] } },
    { ...valid, format: { ...valid.format, legend: 1 } },
    { ...valid, format: { ...valid.format, xTitle: 't'.repeat(61) } },
    { ...valid, format: { ...valid.format, colors: Object.fromEntries(Array.from({ length: 17 }, (_, i) => ['c' + i, 'c1'])) } }]) {
    expect(parseWidgetPayload(input).ok).toBe(false)
  }
  const counter = { column: 'n', row: 999, prefix: 'p'.repeat(16), suffix: '', label: 'l'.repeat(60), decimals: 6, compact: false }
  expect(parseWidgetPayload({ ...valid, chart: 'counter', counter }).ok).toBe(true)
  for (const patch of [{ row: 1000 }, { row: 0.5 }, { row: NaN }, { decimals: -1 }, { prefix: 'p'.repeat(17) }, { suffix: null }, { label: 'l'.repeat(61) }, { compact: 'yes' }]) {
    expect(parseWidgetPayload({ ...valid, chart: 'counter', counter: { ...counter, ...patch } }).ok).toBe(false)
  }
  expect(parseLinkPayload({ v: 1, size: 'xs', position: Infinity, name: 'n' }).ok).toBe(false)
  expect(parseDashboardPayload({ v: 1, title: 'a\nb' }).ok).toBe(false)
})

test('checks serialized UTF-8 bytes and preserves SQL whitespace', () => {
  const sql = '  SELECT 1  '
  expect(parseWidgetPayload({ ...valid, sql })).toMatchObject({ ok: true, value: { sql } })
  expect(parseWidgetPayload({ ...valid, sql: 'é'.repeat(10000) })).toMatchObject({ ok: false })
  expect(parseWidgetPayload({ ...valid, sql: '\\'.repeat(10000) })).toMatchObject({ ok: false })
  expect(parseDashboardPayload({ v: 1, title: 'x', description: 'd'.repeat(500), extra: true }))
    .toEqual({ ok: true, value: { v: 1, title: 'x', description: 'd'.repeat(500) } })
  const first = emptyWidget()
  first.mapping.y.push('n')
  first.format.colors.n = 'c1'
  expect(emptyWidget().mapping.y).toEqual([])
  expect(emptyWidget().format.colors).toEqual({})
})

test('new chart payload validation preserves old payloads', () => {
 const stacked = { ...valid, chart: 'stacked-bar', mapping: { ...valid.mapping, groupBy: 'type', stacking: 'stack' } }
 expect(parseWidgetPayload(stacked).ok).toBe(true)
 expect(parseWidgetPayload({ ...stacked, mapping: { ...stacked.mapping, stacking: 'off' } })).toEqual({ ok: false, error: 'mapping.stacking must be stack or percent for stacked-bar' })
 const histogram = { ...valid, chart: 'histogram', mapping: { ...valid.mapping, x: 'hours', y: [] } }
 expect(parseWidgetPayload(histogram)).toMatchObject({ ok: true, value: { mapping: { bins: 20 } } })
 for (const patch of [{ bins: 15 }, { y: ['n'] }, { x: null }, { groupBy: 'type' }, { stacking: 'stack' }]) expect(parseWidgetPayload({ ...histogram, mapping: { ...histogram.mapping, ...patch } }).ok).toBe(false)
 for (const bins of [10, 20, 30, 50]) expect(parseWidgetPayload({ ...histogram, mapping: { ...histogram.mapping, bins } }).ok).toBe(true)
 const bar = parseWidgetPayload({ ...valid, chart: 'bar', mapping: { ...valid.mapping, bins: 30 } })
 expect(bar.ok && 'bins' in bar.value.mapping).toBe(false)
 const old = parseWidgetPayload(valid)
 expect(old.ok && JSON.stringify(old.value)).toBe(JSON.stringify(valid))
})
