import type { Widget } from '../views'
import { numericColumns } from '../table'
import { compact } from '../format'
import type { WidgetPayload, WidgetMapping, CounterConfig, NumberFormat, ChartType } from './schema'

export type ResultData = { columns: string[]; types?: string[]; rows: unknown[][] }
const finite = (v: unknown): number | null => {
 if (typeof v !== 'number' && typeof v !== 'bigint') return null
 const n = Number(v)
 return Number.isFinite(n) ? n : null
}
export function toChartWidget(p: WidgetPayload, id: string): Widget {
 const kind = p.chart === 'counter' ? 'stat' : p.chart === 'hbar' ? 'bar' : p.chart === 'bar' ? (p.mapping.groupBy || p.mapping.stacking !== 'off' ? 'stacked-bar' : 'histogram') : p.chart
 return { id, title: p.name, sql: p.sql, kind, x: p.chart === 'histogram' ? 'bin' : p.mapping.x ?? undefined, y: p.chart === 'histogram' ? ['count'] : p.mapping.y, series: p.mapping.groupBy ?? undefined,
  stacking: p.chart === 'stacked-bar' && p.mapping.stacking === 'off' ? 'stack' : p.mapping.stacking, numberFormat: p.format.number, colors: Object.fromEntries(Object.entries(p.format.colors).map(([k,v]) => [k, `var(--${v})`])),
  legend: p.chart === 'histogram' ? false : p.format.legend, labels: p.format.labels, xTitle: p.format.xTitle ?? undefined, yTitle: p.format.yTitle ?? undefined }
}
export function formatNumber(value: unknown, fmt: NumberFormat): string {
 const n = finite(value)
 if (n === null) return ''
 if (fmt === '0.00%') return new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
 if (fmt === '0.0a') return Math.abs(n) < 1000 ? n.toFixed(1) : compact(n)
 return typeof value === 'bigint' ? value.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
export function sortRows(data: ResultData, mapping: WidgetMapping): ResultData {
 if (mapping.sort === 'query') return data
 const i = data.columns.indexOf((mapping.sort === 'x' ? mapping.x : mapping.y[0]) ?? '')
 if (i < 0) return data
 return { ...data, rows: [...data.rows].sort((a,b) => {
  if (mapping.sort === 'ydesc') return (finite(b[i]) ?? 0) - (finite(a[i]) ?? 0)
  const av = a[i], bv = b[i]
  if (av == null || bv == null) return av == null ? bv == null ? 0 : -1 : 1
  return av < bv ? -1 : av > bv ? 1 : 0
 }) }
}
export function autoChart(data: ResultData): { chart: ChartType; mapping: WidgetMapping; counter: CounterConfig | null } {
 const mapping: WidgetMapping = { x: null, y: [], groupBy: null, stacking: 'off', sort: 'query' }
 const nums = numericColumns(data.columns, data.rows)
 const ni = nums.findIndex(Boolean)
 if (ni < 0 || !data.rows.length) return { chart: 'table', mapping, counter: null }
 const column = data.columns[ni]
 if (data.rows.length === 1 && nums.filter(Boolean).length === 1) return { chart: 'counter', mapping, counter: { column, row: 0, prefix: '', suffix: '', label: '', decimals: 0, compact: false } }
 const time = data.columns.findIndex((name,i) => ['timestamp','date','time'].includes(data.types?.[i] ?? '') || (data.types?.[i] === 'integer' && /(_at|block|time|date|day|hour|bucket)$/i.test(name)))
 const y = nums.findIndex((n,i) => n && i !== time)
 if (time >= 0 && y >= 0) return { chart: 'line', mapping: { ...mapping, x: data.columns[time], y: [data.columns[y]] }, counter: null }
 const text = data.columns.findIndex((_,i) => data.types?.[i] === 'text' || (!data.types?.[i] && !nums[i]))
 if (text >= 0) return { chart: data.rows.length > 8 ? 'hbar' : 'bar', mapping: { ...mapping, x: data.columns[text], y: [column] }, counter: null }
 return { chart: 'table', mapping, counter: null }
}
export function counterSummary(cfg: CounterConfig, data: ResultData): { text: string; label: string } | null {
 const n = finite(data.rows[cfg.row]?.[data.columns.indexOf(cfg.column)])
 if (n === null) return null
 const value = cfg.compact ? compact(n) : n.toLocaleString('en-US', { minimumFractionDigits: cfg.decimals, maximumFractionDigits: cfg.decimals })
 return { text: cfg.prefix + value + cfg.suffix, label: cfg.label }
}

export function stackReady(mapping: WidgetMapping): boolean { return !!mapping.groupBy || mapping.y.length >= 2 }
export function histogramData(data: ResultData, column: string, bins: number, fmt: NumberFormat): ResultData {
 const index = data.columns.indexOf(column)
 const values = data.rows.map(row => finite(row[index])).filter((v): v is number => v !== null)
 const result: ResultData = { columns: ['bin', 'count'], types: ['text', 'integer'], rows: [] }
 if (!values.length) return result
 const min = Math.min(...values), max = Math.max(...values)
 if (min === max) return { ...result, rows: [[formatNumber(min, fmt), values.length]] }
 const width = (max - min) / bins
 const counts = Array<number>(bins).fill(0)
 for (const value of values) counts[Math.min(bins - 1, Math.floor((value - min) / width))]++
 return { ...result, rows: counts.map((count, i) => [`${formatNumber(min + i * width, fmt)}–${formatNumber(i === bins - 1 ? max : min + (i + 1) * width, fmt)}`, count]) }
}
