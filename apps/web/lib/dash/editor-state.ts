import { numericColumns } from '../table'
import { autoChart } from './chart'
import { checkWidgetSql } from './sql-guard'
import { defaultSize, emptyWidget, parseWidgetPayload, type WidgetPayload, type Size, type LifetimeDays, type ChartType, type WidgetMapping, type WidgetFormat, type CounterConfig } from './schema'

export type RunResult = { columns: string[]; types: string[]; rows: unknown[][]; ms: number }
export type EditorState = { draft: WidgetPayload; original: WidgetPayload | null; result: RunResult | null; ranSql: string | null; runError: string | null; chartTouched: boolean; sizeTouched?: boolean; addTo: { dashboard: string; size: Size } | null }
export type EditorAction = { type: 'name'; value: string } | { type: 'lifetime'; value: LifetimeDays } | { type: 'sql'; value: string } | { type: 'ran'; sql: string; result: RunResult }
 | { type: 'runError'; error: string } | { type: 'chart'; value: ChartType } | { type: 'mapping'; patch: Partial<WidgetMapping> } | { type: 'format'; patch: Partial<WidgetFormat> }
 | { type: 'counter'; patch: Partial<CounterConfig> } | { type: 'addTo'; value: { dashboard: string; size: Size } | null }
export const DRAFT_KEY = 'dash-widget-draft-v1'
export function initEditor(original: WidgetPayload | null = null, addToDashboard: string | null = null): EditorState {
 return { draft: original ? structuredClone(original) : emptyWidget(), original, result: null, ranSql: null, runError: null, chartTouched: !!original, addTo: addToDashboard ? { dashboard: addToDashboard, size: 'md' } : null }
}
function chartSize(state: EditorState, chart: ChartType) {
 return state.addTo && !state.sizeTouched ? { ...state.addTo, size: defaultSize(chart) } : state.addTo
}
export function editorReducer(state: EditorState, action: EditorAction): EditorState {
 const draft = state.draft
 switch (action.type) {
  case 'name': return { ...state, draft: { ...draft, name: action.value } }
  case 'lifetime': return { ...state, draft: { ...draft, lifetimeDays: action.value } }
  case 'sql': return { ...state, draft: { ...draft, sql: action.value } }
  case 'ran': {
   const automatic = !state.chartTouched && state.result === null ? autoChart(action.result) : null
   return { ...state, result: action.result, ranSql: action.sql, runError: null, draft: automatic ? { ...draft, ...automatic } : draft, addTo: automatic ? chartSize(state, automatic.chart) : state.addTo }
  }
  case 'runError': return { ...state, runError: action.error, ranSql: null }
  case 'chart': {
   const automatic = state.result ? autoChart(state.result) : null
   const { bins: _bins, ...withoutBins } = draft.mapping
   let mapping: WidgetMapping = action.value === 'histogram' ? draft.mapping : withoutBins
   if (action.value === 'stacked-bar' && mapping.stacking === 'off') mapping = { ...mapping, stacking: 'stack' }
   if (action.value === 'histogram') {
    const numeric = state.result ? numericColumns(state.result.columns, state.result.rows) : []
    const columns = state.result?.columns ?? []
    mapping = { ...withoutBins, x: numeric[columns.indexOf(draft.mapping.x ?? '')] ? draft.mapping.x : columns.find((_, i) => numeric[i]) ?? null, y: [], groupBy: null, stacking: 'off', bins: 20 }
   }
   return { ...state, chartTouched: true, addTo: chartSize(state, action.value), draft: { ...draft, chart: action.value, mapping, counter: action.value === 'counter' ? draft.counter ?? automatic?.counter ?? { column: state.result?.columns.find((_, i) => ['integer', 'float', 'decimal'].includes(state.result?.types[i] ?? '')) ?? state.result?.columns[0] ?? '', row: 0, prefix: '', suffix: '', label: '', decimals: 0, compact: false } : null } }
  }
  case 'mapping': return { ...state, draft: { ...draft, mapping: { ...draft.mapping, ...action.patch } } }
  case 'format': return { ...state, draft: { ...draft, format: { ...draft.format, ...action.patch } } }
  case 'counter': return { ...state, draft: { ...draft, counter: draft.counter ? { ...draft.counter, ...action.patch } : null } }
  case 'addTo': return { ...state, addTo: action.value, sizeTouched: !!action.value && state.addTo?.dashboard === action.value.dashboard }
 }
}
export function canSave(state: EditorState): { ok: true } | { ok: false; reason: string } {
 if (!state.draft.name.trim()) return { ok: false, reason: 'Give your widget a name' }
 if (!state.result) return { ok: false, reason: 'Run the query first' }
 const guard = checkWidgetSql(state.draft.sql)
 if (guard) return { ok: false, reason: guard }
 if (!state.result || state.ranSql !== state.draft.sql || state.runError) return { ok: false, reason: 'Run the query first' }
 if (state.original && JSON.stringify(state.original) === JSON.stringify(state.draft)) return { ok: false, reason: 'No changes' }
 const parsed = parseWidgetPayload(state.draft)
 return parsed.ok ? { ok: true } : { ok: false, reason: parsed.error }
}
