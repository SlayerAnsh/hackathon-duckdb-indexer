import { checkWidgetSql } from './sql-guard'

export const DASH_PROJECT = 'arkiv-sql-indexer-dash'
export const CONTENT_TYPE = 'application/json'
export const CHART_TYPES = ['table', 'counter', 'bar', 'stacked-bar', 'hbar', 'line', 'area', 'donut', 'histogram'] as const
export type ChartType = (typeof CHART_TYPES)[number]
export const SIZES = ['xs', 'sm', 'md', 'xl'] as const
export type Size = (typeof SIZES)[number]
export const SIZE_SPAN: Record<Size, number> = { xs: 3, sm: 4, md: 6, xl: 12 }
export const LIFETIME_DAYS = [1, 7, 30, 90] as const
export type LifetimeDays = (typeof LIFETIME_DAYS)[number]
export const LOGINS = ['google', 'discord', 'x', 'telegram'] as const
export type Login = (typeof LOGINS)[number]
export const NUMBER_FORMATS = ['0,0', '0.0a', '0.00%'] as const
export type NumberFormat = (typeof NUMBER_FORMATS)[number]
export const STACKINGS = ['off', 'stack', 'percent'] as const
export type Stacking = (typeof STACKINGS)[number]
export const SORTS = ['query', 'x', 'ydesc'] as const
export type Sort = (typeof SORTS)[number]
export const COLOR_TOKENS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const
export type ColorToken = (typeof COLOR_TOKENS)[number]
export const BLOCKS_PER_DAY = 43200
export const MAX_REMAINING_DAYS = 90
export const DASHBOARD_LIFETIME_DAYS = 90
export const MAX_LINKS_PER_DASHBOARD = 48
export const LIMITS = { name: 80, attrBytes: 128, sql: 10000, description: 500, payloadBytes: 16384,
  axisTitle: 60, yColumns: 8, colors: 16, column: 128, affix: 16, counterLabel: 60, counterRow: 999, decimals: 6 }
export const HISTOGRAM_BINS = [10, 20, 30, 50] as const
export type WidgetMapping = { x: string | null; y: string[]; groupBy: string | null; stacking: Stacking; sort: Sort; bins?: number }
export type CounterConfig = { column: string; row: number; prefix: string; suffix: string; label: string; decimals: number; compact: boolean }
export type WidgetFormat = { number: NumberFormat; xTitle: string | null; yTitle: string | null; legend: boolean; labels: boolean; colors: Record<string, ColorToken> }
export type WidgetPayload = { v: 1; name: string; sql: string; chart: ChartType; mapping: WidgetMapping; counter: CounterConfig | null; format: WidgetFormat; lifetimeDays: LifetimeDays }
export type DashboardPayload = { v: 1; title: string; description: string }
export type LinkPayload = { v: 1; size: Size; position: number; name: string }
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }
export type DashErrorCode = 'invalid' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'at_cap' | 'full' | 'rate_limited' | 'busy' | 'disabled' | 'chain'
export type SessionInfo = { address: string; login: Login }
export type WriteResult = { txHash: string; afterBlock: number; key?: string; linkKey?: string; expiresAt?: number }

export function utf8Bytes(value: string): number { return new TextEncoder().encode(value).length }
export function isHexAddress(value: string): boolean { return /^0x[0-9a-fA-F]{40}$/.test(value) }
export function isEntityKey(value: string): boolean { return /^0x[0-9a-fA-F]{64}$/.test(value) }
export function defaultSize(chart: ChartType): Size { return chart === 'counter' ? 'xs' : chart === 'donut' ? 'sm' : 'md' }
export function emptyWidget(): WidgetPayload {
  return { v: 1, name: '', sql: '', chart: 'table',
    mapping: { x: null, y: [], groupBy: null, stacking: 'off', sort: 'query' }, counter: null,
    format: { number: '0,0', xTitle: null, yTitle: null, legend: true, labels: false, colors: {} }, lifetimeDays: 7 }
}

class ValidationError extends Error {}
function invalid(message: string): never { throw new ValidationError(message) }
function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${field} must be an object`)
  return value as Record<string, unknown>
}
function text(value: unknown, field: string, max: number, min = 0): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) invalid(`${field} must be ${min} to ${max} characters`)
  return value
}
function name(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(`${field} must be a string`)
  if (/[\u0000-\u001f]/.test(value)) invalid(`${field} cannot contain control characters`)
  const result = text(value.trim(), field, LIMITS.name, 1)
  if (utf8Bytes(result) > LIMITS.attrBytes) invalid(`${field} must be at most ${LIMITS.attrBytes} UTF-8 bytes`)
  return result
}
function choice<T extends string | number>(value: unknown, values: readonly T[], field: string): T {
  if (!values.includes(value as T)) invalid(`${field} is invalid`)
  return value as T
}
function integer(value: unknown, field: string, max = Number.MAX_VALUE): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) invalid(`${field} must be an integer from 0 to ${max}`)
  return value
}
function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(`${field} must be a boolean`)
  return value
}
function column(value: unknown, field: string): string { return text(value, field, LIMITS.column, 1) }
function nullableColumn(value: unknown, field: string): string | null { return value === null ? null : column(value, field) }
function axis(value: unknown, field: string): string | null { return value === null ? null : text(value, field, LIMITS.axisTitle) }
function parse<T>(build: () => T): Parsed<T> {
  try {
    const value = build()
    if (utf8Bytes(JSON.stringify(value)) > LIMITS.payloadBytes) invalid(`payload must be at most ${LIMITS.payloadBytes} bytes`)
    return { ok: true, value }
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message }
    throw error
  }
}

export function parseWidgetPayload(input: unknown, checkSql: (sql: string) => string | null = checkWidgetSql): Parsed<WidgetPayload> {
  return parse(() => {
    const p = object(input, 'widget')
    const v = choice(p.v, [1] as const, 'v')
    const widgetName = name(p.name, 'name')
    const sql = text(p.sql, 'sql', LIMITS.sql, 1)
    if (!sql.trim()) invalid('sql must not be blank')
    const sqlError = checkSql(sql)
    if (sqlError !== null) invalid(sqlError)
    const chart = choice(p.chart, CHART_TYPES, 'chart')
    const m = object(p.mapping, 'mapping')
    if (!Array.isArray(m.y) || m.y.length > LIMITS.yColumns) invalid(`mapping.y must have at most ${LIMITS.yColumns} columns`)
    const mapping: WidgetMapping = { x: nullableColumn(m.x, 'mapping.x'), y: m.y.map(y => column(y, 'mapping.y')),
      groupBy: nullableColumn(m.groupBy, 'mapping.groupBy'), stacking: choice(m.stacking, STACKINGS, 'mapping.stacking'), sort: choice(m.sort, SORTS, 'mapping.sort') }
    if (mapping.groupBy !== null && mapping.y.length > 1) invalid('mapping.groupBy cannot use several Y columns')
    if (chart === 'stacked-bar' && mapping.stacking === 'off') invalid('mapping.stacking must be stack or percent for stacked-bar')
    if (chart === 'histogram') {
      if (mapping.x === null) invalid('mapping.x is required for histogram')
      if (mapping.y.length) invalid('mapping.y must be empty for histogram')
      if (mapping.groupBy !== null) invalid('mapping.groupBy must be null for histogram')
      if (mapping.stacking !== 'off') invalid('mapping.stacking must be off for histogram')
      mapping.bins = choice(m.bins === undefined ? 20 : m.bins, HISTOGRAM_BINS, 'mapping.bins')
    }
    let counter: CounterConfig | null = null
    if (chart === 'counter') {
      const c = object(p.counter, 'counter')
      counter = { column: column(c.column, 'counter.column'), row: integer(c.row, 'counter.row', LIMITS.counterRow),
        prefix: text(c.prefix, 'counter.prefix', LIMITS.affix), suffix: text(c.suffix, 'counter.suffix', LIMITS.affix),
        label: text(c.label, 'counter.label', LIMITS.counterLabel), decimals: integer(c.decimals, 'counter.decimals', LIMITS.decimals), compact: boolean(c.compact, 'counter.compact') }
    } else if (p.counter !== null) invalid('counter must be null for this chart')
    const f = object(p.format, 'format')
    const entries = Object.entries(object(f.colors, 'format.colors'))
    if (entries.length > LIMITS.colors) invalid(`format.colors must have at most ${LIMITS.colors} entries`)
    const colors = Object.fromEntries(entries.map(([key, value]) => [column(key, 'format.colors key'), choice(value, COLOR_TOKENS, 'format.colors value')]))
    const format: WidgetFormat = { number: choice(f.number, NUMBER_FORMATS, 'format.number'), xTitle: axis(f.xTitle, 'format.xTitle'), yTitle: axis(f.yTitle, 'format.yTitle'),
      legend: boolean(f.legend, 'format.legend'), labels: boolean(f.labels, 'format.labels'), colors }
    return { v, name: widgetName, sql, chart, mapping, counter, format, lifetimeDays: choice(p.lifetimeDays, LIFETIME_DAYS, 'lifetimeDays') }
  })
}
export function parseDashboardPayload(input: unknown): Parsed<DashboardPayload> {
  return parse(() => {
    const p = object(input, 'dashboard')
    return { v: choice(p.v, [1] as const, 'v'), title: name(p.title, 'title'), description: text(p.description === undefined ? '' : p.description, 'description', LIMITS.description) }
  })
}
export function parseLinkPayload(input: unknown): Parsed<LinkPayload> {
  return parse(() => {
    const p = object(input, 'link')
    return { v: choice(p.v, [1] as const, 'v'), size: choice(p.size, SIZES, 'size'), position: integer(p.position, 'position'), name: name(p.name, 'name') }
  })
}
