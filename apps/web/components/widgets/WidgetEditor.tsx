'use client'
import { useReducer, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { useDocumentTheme, useSqlEditor } from '../playground/useSqlEditor'
import { canSave, editorReducer, type EditorState } from '../../lib/dash/editor-state'
import { checkWidgetSql } from '../../lib/dash/sql-guard'
import { dashApi } from '../../lib/dash/api'
import { saveErrorMessage, withSession } from '../../lib/dash/auth-client'
import { addPending, usePending } from '../../lib/dash/pending'
import { userDashboardsSql } from '../../lib/dash/sql'
import { defaultSize, LIFETIME_DAYS, LIMITS, SIZES, type WidgetPayload, type WriteResult, type Size } from '../../lib/dash/schema'
import { useDashAuth } from '../auth/DashAuthProvider'
import { DataTable } from '../dash/DataTable'
import { RunBadge } from '../dash/RunBadge'
import { TypeTag } from '../dash/TypeTag'
import { ChartPicker } from './ChartPicker'
import { WidgetPreview } from './WidgetPreview'
import { WidgetSettings } from './WidgetSettings'
import pg from '../playground/playground.module.css'
import cards from '../showcase/showcase.module.css'
import s from './widgets.module.css'

export function WidgetEditor({ mode, initial, widgetKey, onSaved }: { mode: 'create' | 'edit'; initial: EditorState; widgetKey?: string; onSaved(result: WriteResult, payload: WidgetPayload): void }) {
 const [state, dispatch] = useReducer(editorReducer, initial)
 const [running, setRunning] = useState(false)
 const [saving, setSaving] = useState(false)
 const [saveError, setSaveError] = useState<string | null>(null)
 const runBusy = useRef(false), saveBusy = useRef(false)
 const { db, version } = useIndex()
 const auth = useDashAuth()
 const config = auth.config
 const pending = usePending()
 const dashboards = useTimedQuery(mode === 'create' && config?.enabled && auth.address ? userDashboardsSql(config.wallet, auth.address, null) : 'SELECT NULL AS key, NULL AS title WHERE false', version)
 const choices = new Map<string, string>((dashboards.data?.rows ?? []).map(row => [String(row[0]), String(row[1])]))
 for (const write of pending) if (write.kind === 'dashboard' && write.op === 'upsert' && auth.address && (!write.fields?.user || String(write.fields.user).toLowerCase() === auth.address.toLowerCase())) choices.set(write.key, String(write.fields?.title ?? choices.get(write.key) ?? ''))
 if (state.addTo && !choices.has(state.addTo.dashboard)) choices.set(state.addTo.dashboard, state.addTo.dashboard)
 async function run() {
  const sql = state.draft.sql
  const reason = checkWidgetSql(sql)
  if (reason) { dispatch({ type: 'runError', error: reason }); return }
  if (!db || runBusy.current) return
  runBusy.current = true; setRunning(true)
  try {
   const data = await db.run(sql, 5000)
   dispatch({ type: 'ran', sql, result: { columns: data.columns, types: data.types, rows: data.rows, ms: data.elapsedMs } })
  } catch (error) { dispatch({ type: 'runError', error: error instanceof Error ? error.message : String(error) }) }
  finally { runBusy.current = false; setRunning(false) }
 }
 const { extensions } = useSqlEditor(db, () => void run())
 const theme = useDocumentTheme()
 const eligibility = canSave(state)
 async function save() {
  if (!canSave(state).ok || runBusy.current || saveBusy.current) return
  saveBusy.current = true; setSaving(true); setSaveError(null)
  const widget = state.draft, addTo = state.addTo
  try {
   const result = await withSession(() => mode === 'create' ? dashApi.createWidget({ widget, ...(addTo ? { addTo } : {}) }) : widgetKey ? dashApi.updateWidget(widgetKey, widget) : Promise.reject(new Error('Missing widget key')), auth.requestLogin)
   const key = result.key ?? widgetKey
   if (key) addPending({ key, kind: 'widget', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: { name: widget.name, chart: widget.chart, ...(auth.address ? { user: auth.address } : {}) } })
   if (result.linkKey && key && addTo) addPending({ key: result.linkKey, kind: 'link', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: { dashboard: addTo.dashboard, widget: key, name: widget.name, size: addTo.size } })
   onSaved(result, widget)
  } catch (error) { setSaveError(saveErrorMessage(error)) }
  finally { saveBusy.current = false; setSaving(false) }
 }
 if (!config) return <p>Loading the index into your browser…</p>
 if (!config.enabled) return <p>Dashboards are not enabled on this deployment.</p>
 return <div className={s.editor}>
  <header className={s.header}>
   <a href="/me">← My home</a>
   <input className={s.name} aria-label="Widget name" placeholder="Untitled widget" maxLength={LIMITS.name} value={state.draft.name} onChange={e => dispatch({ type: 'name', value: e.target.value })}/>
   <fieldset className={s.lifetime}><legend>Lives for</legend>{LIFETIME_DAYS.map(days => <button type="button" className="btn btn-quiet" key={days} aria-pressed={state.draft.lifetimeDays === days} onClick={() => dispatch({ type: 'lifetime', value: days })}>{days} {days === 1 ? 'day' : 'days'}</button>)}</fieldset>
   <button type="button" className="btn btn-primary" disabled={!eligibility.ok || saving || running} title={eligibility.ok ? undefined : eligibility.reason} onClick={() => void save()}>{saving ? 'Saving…' : mode === 'create' ? 'Save to Arkiv' : 'Save changes'}</button>
  </header>
  {saveError && <p className="error" role="alert">{saveError}</p>}
  <section className={pg.editorCard} aria-label="SQL editor"><div className={pg.runbar}><span className={pg.hint}><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Enter</kbd></span><button type="button" className="btn btn-primary" disabled={!db || running || saving} onClick={() => void run()}>{running ? 'Running…' : '▶ Run'}</button></div><CodeMirror aria-label="SQL query" value={state.draft.sql} height="240px" theme={theme} extensions={extensions} onChange={value => dispatch({ type: 'sql', value })} basicSetup={{ foldGutter: false }}/></section>
  {state.runError && <p className="error" role="alert">{state.runError}</p>}
  <section className={s.results} aria-label="Query results">{state.result ? <><div className={s.meta}><RunBadge ms={state.result.ms} rows={state.result.rows.length}/>{state.result.columns.map((c, i) => <TypeTag key={i} value={`${c} ${state.result!.types[i] ?? 'other'}`} index={i}/>)}</div><div className={s.table}><DataTable data={state.result}/></div></> : !db && <p className="empty">Loading the index into your browser…</p>}</section>
  <ChartPicker value={state.draft.chart} onChange={value => dispatch({ type: 'chart', value })}/>
  <div className={s.columns}><section className={cards.card} aria-label="Widget preview"><div className={cards.body}>{state.result ? <WidgetPreview id="widget-editor-preview" payload={state.draft} query={{ data: state.result, ms: state.result.ms, loading: false }}/> : <p className="empty">Run the query to see a preview.</p>}</div></section><WidgetSettings state={state} dispatch={dispatch}/></div>
  {mode === 'create' && <section className={s.settings}><label>Add to dashboard<select value={state.addTo?.dashboard ?? ''} onChange={e => dispatch({ type: 'addTo', value: e.target.value ? { dashboard: e.target.value, size: defaultSize(state.draft.chart) } : null })}><option value="">None</option>{Array.from(choices, ([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>{state.addTo && <fieldset><legend>Size</legend>{SIZES.map(size => <button type="button" className="btn btn-quiet" key={size} aria-pressed={state.addTo?.size === size} onClick={() => dispatch({ type: 'addTo', value: { dashboard: state.addTo!.dashboard, size: size as Size } })}>{size.toUpperCase()}</button>)}</fieldset>}</section>}
 </div>
}
