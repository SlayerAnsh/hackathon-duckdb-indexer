import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { canSave, editorReducer as reduce, initEditor } from '../lib/dash/editor-state'
import { WidgetSettings } from '../components/widgets/WidgetSettings'
import { WidgetEditor } from '../components/widgets/WidgetEditor'
import { NewWidgetBody } from '../app/widgets/new/page'
import { DashAuthContext, type DashAuth } from '../components/auth/DashAuthProvider'
import { checkWidgetSql } from '../lib/dash/sql-guard'

const D = '0x' + 'ab'.repeat(32)
const result = { columns: ['n'], types: ['integer'], rows: [[42]], ms: 1 }
const run = (state = initEditor()) => reduce(state, { type: 'ran', sql: state.draft.sql, result })

test('first run selects an automatic chart, later runs preserve the choice', () => {
 const first = run()
 expect(first.draft.chart).toBe('counter')
 expect(first.draft.counter?.column).toBe('n')
 expect(reduce(first, { type: 'ran', sql: '', result: { ...result, rows: [] } }).draft.chart).toBe('counter')
 const touched = reduce(initEditor(), { type: 'chart', value: 'line' })
 expect(touched.chartTouched).toBe(true)
 expect(run(touched).draft.chart).toBe('line')
 const counter = reduce(touched, { type: 'chart', value: 'counter' })
 expect(counter.draft.counter).not.toBeNull()
 expect(reduce(counter, { type: 'chart', value: 'bar' }).draft.counter).toBeNull()
})

test('save requires a name, a successful run of the current SQL, valid SQL and changes', () => {
 let state = initEditor()
 expect(canSave(state)).toEqual({ ok: false, reason: 'Give your widget a name' })
 state = reduce(state, { type: 'name', value: 'Count' })
 expect(canSave(state)).toEqual({ ok: false, reason: 'Run the query first' })
 state = run(reduce(state, { type: 'sql', value: 'SELECT 42 AS n' }))
 expect(canSave(state)).toEqual({ ok: true })
 state = reduce(state, { type: 'sql', value: 'SELECT 43 AS n' })
 expect(canSave(state)).toEqual({ ok: false, reason: 'Run the query first' })
 state = run(state)
 expect(canSave(state)).toEqual({ ok: true })
 expect(canSave(run(initEditor(state.draft)))).toEqual({ ok: false, reason: 'No changes' })
 state = run(reduce(state, { type: 'sql', value: 'DELETE FROM entities' }))
 expect(canSave(state)).toEqual({ ok: false, reason: checkWidgetSql(state.draft.sql)! })
})

test('dashboard size follows chart defaults until explicitly changed', () => {
 const initial = initEditor(null, D)
 expect(initial.addTo).toEqual({ dashboard: D, size: 'md' })
 const counter = reduce(initial, { type: 'chart', value: 'counter' })
 expect(counter.addTo?.size).toBe('xs')
 expect(run(initial).addTo?.size).toBe('xs')
 const custom = reduce(initial, { type: 'addTo', value: { dashboard: D, size: 'xl' } })
 expect(reduce(custom, { type: 'chart', value: 'counter' }).addTo?.size).toBe('xl')
 const explicitDefault = reduce(initial, { type: 'addTo', value: { dashboard: D, size: 'md' } })
 expect(reduce(explicitDefault, { type: 'chart', value: 'counter' }).addTo?.size).toBe('md')
})

test('new widget body requires a session', () => {
 const auth: DashAuth = { config: { enabled: true, privyAppId: 'app', wallet: '0x' + 'ab'.repeat(20), rpcUrl: 'https://offline.test' }, status: 'anonymous', confirming: false, error: null, sign: async () => { throw Error('unused') }, requestLogin: async () => false, logout: async () => {}, refresh: async () => {} }
 const html = renderToStaticMarkup(<DashAuthContext.Provider value={auth}><NewWidgetBody/></DashAuthContext.Provider>)
 expect(html).toContain('Log in to build dashboards')
 expect(html).toContain('Use Google, Discord, X or Telegram.')
 expect(html).not.toContain('Save to Arkiv')
})

test('editor renders the required initial controls and preview', () => {
 const auth: DashAuth = { config: { enabled: true, privyAppId: 'app', wallet: '0x' + 'ab'.repeat(20), rpcUrl: 'https://offline.test' }, status: 'authenticated', confirming: false, error: null, sign: async () => { throw Error('unused') }, requestLogin: async () => true, logout: async () => {}, refresh: async () => {} }
 const html = renderToStaticMarkup(<DashAuthContext.Provider value={auth}><WidgetEditor mode="create" initial={initEditor()} onSaved={() => {}}/></DashAuthContext.Provider>)
 for (const text of ['Untitled widget', '1 day', '7 days', '30 days', '90 days', 'Save to Arkiv', 'Run the query to see a preview.', 'role="radiogroup"', 'Chart type']) expect(html).toContain(text)
})


test('automatic mapping and failed runs preserve the draft and require another successful run', () => {
 let state = reduce(initEditor(), { type: 'name', value: 'Counts' })
 state = reduce(state, { type: 'sql', value: 'SELECT creator, count(*) AS n FROM entities GROUP BY creator' })
 state = reduce(state, { type: 'ran', sql: state.draft.sql, result: { columns: ['creator', 'n'], types: ['text', 'integer'], rows: [['a', 1], ['b', 2]], ms: 2 } })
 expect(state.draft.chart).toBe('bar')
 expect(state.draft.mapping).toMatchObject({ x: 'creator', y: ['n'] })
 const draft = state.draft
 state = reduce(state, { type: 'runError', error: 'Query failed' })
 expect(state.draft).toEqual(draft)
 expect(state.runError).toBe('Query failed')
 expect(canSave(state)).toEqual({ ok: false, reason: 'Run the query first' })
 expect(canSave(run(state))).toEqual({ ok: true })
})

test('settings hide chart fields that do not apply and keep Format collapsed', () => {
 const render = (state: ReturnType<typeof initEditor>) => renderToStaticMarkup(<WidgetSettings state={state} dispatch={() => {}}/>)
 expect(render(initEditor())).not.toContain('Group by')
 const counter = render(reduce(run(), { type: 'chart', value: 'counter' }))
 for (const label of ['Value column', 'Row', 'Prefix', 'Suffix', 'Label', 'Decimals', 'Compact']) expect(counter).toContain(label)
 expect(counter).not.toContain('Stacking')
 const bar = render(reduce(run(), { type: 'chart', value: 'bar' }))
 for (const label of ['X / label', 'Y / values', '+ Add column', 'Group by', 'Stacking', 'Sort', '<summary>Format</summary>']) expect(bar).toContain(label)
 expect(bar).not.toContain('<details open')
 const donut = render(reduce(run(), { type: 'chart', value: 'donut' }))
 expect(donut).not.toContain('Group by')
 expect(donut).not.toContain('axis title')
})

test('new chart choices normalize mappings and expose only applicable settings', async () => {
 const { ChartPicker, pickerIndex } = await import('../components/widgets/ChartPicker')
 const state = reduce(initEditor(), { type: 'ran', sql: '', result: { columns: ['name', 'hours'], types: ['text', 'double'], rows: [['a', 1], ['b', 2]], ms: 1 } })
 expect(reduce(state, { type: 'chart', value: 'stacked-bar' }).draft.mapping.stacking).toBe('stack')
 const histogram = reduce(state, { type: 'chart', value: 'histogram' })
 expect(histogram.draft.mapping).toMatchObject({ x: 'hours', y: [], groupBy: null, stacking: 'off', bins: 20 })
 expect(reduce(histogram, { type: 'chart', value: 'bar' }).draft.mapping).not.toHaveProperty('bins')
 expect(reduce({ ...state, draft: { ...state.draft, mapping: { ...state.draft.mapping, x: 'hours' } } }, { type: 'chart', value: 'histogram' }).draft.mapping.x).toBe('hours')
 const html = renderToStaticMarkup(<WidgetSettings state={histogram} dispatch={() => {}}/>)
 for (const label of ['Value column', 'Bins', '>10<', '>20<', '>30<', '>50<']) expect(html).toContain(label)
 for (const label of ['Y / values', 'Group by', 'Stacking', 'Sort', 'Legend', 'Color for', 'value="name"']) expect(html).not.toContain(label)
 const stacked = renderToStaticMarkup(<WidgetSettings state={reduce(state, { type: 'chart', value: 'stacked-bar' })} dispatch={() => {}}/>)
 expect(stacked).toContain('>Stack<'); expect(stacked).toContain('>100%<'); expect(stacked).not.toContain('>Off<')
 const picker = renderToStaticMarkup(<ChartPicker value="table" onChange={() => {}}/>)
 expect(picker.match(/role="radio"/g)).toHaveLength(9); expect(picker).toContain('Stacked bar'); expect(picker).toContain('Histogram')
 expect(pickerIndex('End', 0)).toBe(8); expect(pickerIndex('ArrowRight', 8)).toBe(0); expect(pickerIndex('ArrowLeft', 0)).toBe(8)
})
