import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { emptyWidget, type ChartType } from '../lib/dash/schema'
import { toChartWidget, formatNumber, autoChart, sortRows, counterSummary } from '../lib/dash/chart'
import { WidgetPreview } from '../components/widgets/WidgetPreview'
import { CounterBody } from '../components/widgets/CounterBody'
import { QueryChart } from '../components/dash/AreaChart'
test('toChartWidget maps chart types per the UI doc table', () => {
  const base = emptyWidget()
  const kind = (chart: ChartType, mapping = {}) => toChartWidget({ ...base, chart, mapping: { ...base.mapping, x: 'x', y: ['n'], ...mapping } }, 'w').kind
  expect(['table', 'hbar', 'line', 'area', 'donut'].map(c => kind(c as ChartType))).toEqual(['table', 'bar', 'line', 'area', 'donut'])
  expect(kind('bar')).toBe('histogram'); expect(kind('bar', { stacking: 'stack' })).toBe('stacked-bar'); expect(kind('bar', { groupBy: 'g' })).toBe('stacked-bar')
  const w = toChartWidget({ ...base, name: 'N', sql: 'SELECT 1', chart: 'line', mapping: { ...base.mapping, x: 'day', y: ['a'], groupBy: 'g', stacking: 'percent' },
    format: { ...base.format, number: '0.00%', colors: { a: 'c3' }, xTitle: 'Day' } }, 'w1')
  expect(w).toMatchObject({ id: 'w1', title: 'N', sql: 'SELECT 1', x: 'day', y: ['a'], series: 'g', stacking: 'percent', numberFormat: '0.00%', colors: { a: 'var(--c3)' }, xTitle: 'Day' })
})
test('formatNumber', () => {
  expect(formatNumber(1234567.8, '0,0')).toBe('1,234,568'); expect(formatNumber(BigInt(1234), '0,0')).toBe('1,234')
  expect(formatNumber(1234, '0.0a')).toBe('1.2k'); expect(formatNumber(2_500_000, '0.0a')).toBe('2.5m'); expect(formatNumber(12, '0.0a')).toBe('12.0')
  expect(formatNumber(0.1234, '0.00%')).toBe('12.34%')
  for (const v of [null, undefined, 'x', NaN, Infinity]) expect(formatNumber(v, '0,0')).toBe('')
})
test('autoChart follows spec 9.3', () => {
  expect(autoChart({ columns: ['n'], types: ['integer'], rows: [[5]] }).chart).toBe('counter')
  expect(autoChart({ columns: ['n'], types: ['integer'], rows: [[5]] }).counter).toEqual({ column: 'n', row: 0, prefix: '', suffix: '', label: '', decimals: 0, compact: false })
  expect(autoChart({ columns: ['created_at', 'n'], types: ['integer', 'integer'], rows: [[1, 2], [3, 4]] })).toMatchObject({ chart: 'line', mapping: { x: 'created_at', y: ['n'] } })
  expect(autoChart({ columns: ['day', 'n'], types: ['date', 'integer'], rows: [[1, 2], [3, 4]] }).chart).toBe('line')
  expect(autoChart({ columns: ['creator', 'n'], types: ['text', 'integer'], rows: Array.from({ length: 8 }, (_, i) => ['c' + i, i]) }).chart).toBe('bar')
  expect(autoChart({ columns: ['creator', 'n'], types: ['text', 'integer'], rows: Array.from({ length: 9 }, (_, i) => ['c' + i, i]) }).chart).toBe('hbar')
  expect(autoChart({ columns: ['a', 'b'], types: ['text', 'text'], rows: [['x', 'y']] }).chart).toBe('table')
  expect(autoChart({ columns: [], rows: [] }).chart).toBe('table')
})
test('sortRows', () => {
  const data = { columns: ['x', 'n'], rows: [['b', 1], ['a', 3], ['c', 2]] }
  expect(sortRows(data, { ...emptyWidget().mapping, x: 'x', y: ['n'], sort: 'x' }).rows.map(r => r[0])).toEqual(['a', 'b', 'c'])
  expect(sortRows(data, { ...emptyWidget().mapping, x: 'x', y: ['n'], sort: 'ydesc' }).rows.map(r => r[0])).toEqual(['a', 'c', 'b'])
  expect(sortRows(data, { ...emptyWidget().mapping, sort: 'query' })).toBe(data)
})
test('counter summary and rendering', () => {
  const cfg = { column: 'n', row: 0, prefix: '$', suffix: ' rows', label: 'Live', decimals: 1, compact: true }
  expect(counterSummary(cfg, { columns: ['n'], rows: [[12345]] })).toEqual({ text: '$12.3k rows', label: 'Live' })
  expect(counterSummary(cfg, { columns: ['n'], rows: [] })).toBeNull()
  expect(renderToStaticMarkup(<CounterBody config={cfg} data={{ columns: ['n'], rows: [[12345]] }}/>)).toContain('stat-value')
})
test('extended QueryChart never shows NaN and keeps showcase defaults', () => {
  for (const chart of ['line', 'bar', 'hbar', 'area', 'donut'] as ChartType[]) {
    const w = toChartWidget({ ...emptyWidget(), name: 'N', chart, mapping: { ...emptyWidget().mapping, x: 'x', y: ['n'], stacking: 'percent' }, format: { ...emptyWidget().format, labels: true, number: '0.0a' } }, 'w')
    expect(renderToStaticMarkup(<QueryChart widget={w} data={{ columns: ['x', 'n'], rows: [] }}/>)).toContain('No rows yet')
    const html = renderToStaticMarkup(<QueryChart widget={w} data={{ columns: ['x', 'n'], rows: [['a', null], ['b', 'oops'], ['c', BigInt(10)]] }}/>)
    expect(html).not.toContain('NaN'); expect(html).not.toContain('Infinity')
  }
})

test('invalid counter cells render the empty state and decimals apply', () => {
 const cfg = { column: 'n', row: 0, prefix: '', suffix: '', label: 'Count', decimals: 2, compact: false }
 for (const value of [null, undefined, 'oops', NaN, Infinity, BigInt('1' + '0'.repeat(400))]) {
  const data = { columns: ['n'], rows: [[value]] }
  expect(counterSummary(cfg, data)).toBeNull()
  expect(renderToStaticMarkup(<CounterBody config={cfg} data={data}/>)).toContain('No rows yet')
 }
 expect(counterSummary(cfg, { columns: ['n'], rows: [[BigInt(12)]] })).toEqual({ text: '12.00', label: 'Count' })
 expect(counterSummary({ ...cfg, column: 'missing' }, { columns: ['n'], rows: [[1]] })).toBeNull()
 expect(counterSummary({ ...cfg, row: 1 }, { columns: ['n'], rows: [[1]] })).toBeNull()
})

test('preview sorts counter rows and preserves query error and loading states', () => {
 const payload = { ...emptyWidget(), chart: 'counter' as const, counter: { column: 'n', row: 0, prefix: '$', suffix: '', label: 'Top', decimals: 0, compact: false }, mapping: { ...emptyWidget().mapping, y: ['n'], sort: 'ydesc' as const } }
 const data = { columns: ['n'], rows: [[1], [3]] }
 expect(renderToStaticMarkup(<WidgetPreview payload={payload} id="p" query={{ data, loading: false }}/>)).toContain('$3')
 expect(data.rows).toEqual([[1], [3]])
 expect(renderToStaticMarkup(<WidgetPreview payload={payload} id="p" query={{ data, loading: false, error: 'Query failed' }}/>)).toContain('Query failed')
 expect(renderToStaticMarkup(<WidgetPreview payload={payload} id="p" query={{ loading: true }}/>)).toContain('Waiting for index')
})

test('chart legends retain defaults and respect colors and visibility', () => {
 const data = { columns: ['x', 'a', 'b'], rows: [['one', 1, 2]] }
 const widget = { id: 'old', title: 'Old', sql: '', kind: 'area' as const, x: 'x', y: ['a', 'b'] }
 expect(renderToStaticMarkup(<QueryChart widget={widget} data={data}/>)).toContain('chart-key')
 expect(renderToStaticMarkup(<QueryChart widget={{ ...widget, legend: false }} data={data}/>)).not.toContain('chart-key')
 expect(renderToStaticMarkup(<QueryChart widget={{ ...widget, colors: { a: 'var(--c3)' } }} data={data}/>)).toContain('background:var(--c3)')
})

test('histogram bins numeric finite values and includes the maximum', async () => {
 const { histogramData, stackReady } = await import('../lib/dash/chart')
 const data = (values: unknown[]) => ({ columns: ['n'], rows: values.map(v => [v]) })
 const bins = histogramData(data(Array.from({ length: 10 }, (_, i) => i)), 'n', 5, '0,0')
 expect(bins.columns).toEqual(['bin', 'count']); expect(bins.types).toEqual(['text', 'integer'])
 expect(bins.rows.map(r => r[1])).toEqual([2, 2, 2, 2, 2]); expect(bins.rows[0][0]).toBe('0–2')
 expect(histogramData(data([3, 3, 3]), 'n', 20, '0,0').rows).toEqual([['3', 3]])
 expect(histogramData(data([null, 'x', NaN, Infinity]), 'n', 20, '0,0').rows).toEqual([])
 expect(histogramData(data([]), 'n', 20, '0,0').rows).toEqual([])
 expect(stackReady(emptyWidget().mapping)).toBe(false)
 expect(stackReady({ ...emptyWidget().mapping, groupBy: 'g' })).toBe(true)
 expect(stackReady({ ...emptyWidget().mapping, y: ['a', 'b'] })).toBe(true)
 const base = emptyWidget()
 expect(toChartWidget({ ...base, chart: 'stacked-bar' }, 's')).toMatchObject({ kind: 'stacked-bar', stacking: 'stack' })
 expect(toChartWidget({ ...base, chart: 'histogram' }, 'h')).toMatchObject({ kind: 'histogram', x: 'bin', y: ['count'], legend: false })
 const query = { loading: false, data: data([1, 2, 3]), ms: 1 }
 expect(renderToStaticMarkup(<WidgetPreview payload={{ ...base, chart: 'histogram', mapping: { ...base.mapping, x: 'n' } }} query={query} id="h"/>)).toContain('Binned from 3 rows')
 expect(renderToStaticMarkup(<WidgetPreview payload={{ ...base, chart: 'stacked-bar' }} query={query} id="s"/>)).toContain('Pick a Group by column or a second Y column to stack.')
})
