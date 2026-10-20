'use client'
import { useId, useReducer, useRef, useState } from 'react'
import Link from 'next/link'
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
import { LIFETIME_DAYS, LIMITS, type WidgetPayload, type WriteResult } from '../../lib/dash/schema'
import { useDashAuth } from '../auth/DashAuthProvider'
import { DataTable } from '../dash/DataTable'
import { RunBadge } from '../dash/RunBadge'
import { TypeTag } from '../dash/TypeTag'
import { ChartPicker } from './ChartPicker'
import { WidgetPreview } from './WidgetPreview'
import { WidgetSettings } from './WidgetSettings'
import e from './editor.module.css'

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
 const dashboards = useTimedQuery(mode === 'create' && state.addTo && config?.enabled && auth.address ? userDashboardsSql(config.wallet, auth.address, null) : 'SELECT NULL AS key, NULL AS title WHERE false', version)
 const choices = new Map<string, string>((dashboards.data?.rows ?? []).map(row => [String(row[0]), String(row[1])]))
 for (const write of pending) if (write.kind === 'dashboard' && write.op === 'upsert' && auth.address && (!write.fields?.user || String(write.fields.user).toLowerCase() === auth.address.toLowerCase())) choices.set(write.key, String(write.fields?.title ?? choices.get(write.key) ?? ''))
 const addToTitle = state.addTo ? choices.get(state.addTo.dashboard) || `${state.addTo.dashboard.slice(0, 6)}…${state.addTo.dashboard.slice(-4)}` : ''
 const lifetimeId = useId(), resultsId = useId()
 const [showResults, setShowResults] = useState(false)
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
   const result = await withSession(() => mode === 'create' ? dashApi.createWidget({ widget, ...(addTo ? { addTo } : {}) }) : widgetKey ? dashApi.createWidget({ widget, replaces: widgetKey }) : Promise.reject(new Error('Missing widget key')), auth.requestLogin)
   const key = result.key ?? widgetKey
   if (key) addPending({ key, kind: 'widget', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: { name: widget.name, chart: widget.chart, ...(auth.address ? { user: auth.address, owner: auth.address } : {}) } })
   if (result.linkKey && key && addTo) addPending({ key: result.linkKey, kind: 'link', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: { dashboard: addTo.dashboard, widget: key, name: widget.name, size: addTo.size } })
   for (const link of result.relinked ?? []) if (key) addPending({ key: link, kind: 'link', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: { widget: key, name: widget.name } })
   onSaved(result, widget)
  } catch (error) { setSaveError(saveErrorMessage(error)) }
  finally { saveBusy.current = false; setSaving(false) }
 }
 if (!config) return <p>Loading the index into your browser…</p>
 if (!config.enabled) return <p>Dashboards are not enabled on this deployment.</p>
 const result = state.result
 const counterPreview = result && state.draft.chart === 'counter'
 const kbd = <span className={e.hint}><kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Enter</kbd></span>
 return <div className={e.editor}>
  <header className={e.head}>
   <nav className={e.crumbs} aria-label="Breadcrumb"><Link href="/me">My home</Link><span aria-hidden="true">/</span><span>{mode === 'create' ? 'New widget' : state.draft.name.trim() || 'Untitled widget'}</span></nav>
   <div className={e.titleRow}>
    <input className={e.title} aria-label="Widget name" placeholder="Untitled widget" maxLength={LIMITS.name} value={state.draft.name} onChange={ev => dispatch({ type: 'name', value: ev.target.value })}/>
    <button type="button" className="btn btn-primary" disabled={!eligibility.ok || saving || running} title={eligibility.ok ? undefined : eligibility.reason} onClick={() => void save()}>{saving ? 'Saving…' : mode === 'create' ? 'Save to Arkiv' : 'Save new version'}</button>
   </div>
   <div className={e.metaRow}>
    <div className={e.metaField}><span className={e.caps} id={lifetimeId}>Lifetime</span><div className={e.seg} role="group" aria-labelledby={lifetimeId}>{LIFETIME_DAYS.map(days => <button type="button" key={days} aria-pressed={state.draft.lifetimeDays === days} onClick={() => dispatch({ type: 'lifetime', value: days })}>{days} {days === 1 ? 'day' : 'days'}</button>)}</div></div>
    {mode === 'create' && state.addTo && <span className={e.addChip}>Adds to <b>{addToTitle}</b><button type="button" aria-label="Do not add to a dashboard" className="has-tip" data-tip="Do not add" onClick={() => dispatch({ type: 'addTo', value: null })}><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></span>}
   </div>
   {mode === 'edit' && <p className={e.note}>Widgets are read only on Arkiv. Saving creates a new version and moves your dashboards to it.</p>}
   {saveError && <p className="error" role="alert">{saveError}</p>}
  </header>
  <div className={e.work}>
   <div className={e.main}>
    <section className={e.card} aria-label="SQL editor">
     <div className={e.cardHead}><h2>SQL</h2><span className={e.spacer}/>{kbd}<button type="button" className="btn btn-primary" disabled={!db || running || saving} onClick={() => void run()}>{running ? 'Running…' : '▶ Run'}</button></div>
     <div className={e.code}><CodeMirror aria-label="SQL query" value={state.draft.sql} height="240px" theme={theme} extensions={extensions} onChange={value => dispatch({ type: 'sql', value })} basicSetup={{ foldGutter: false }}/></div>
    </section>
    <section className={e.card} aria-label="Widget preview">
     <div className={e.cardHead}><h2>Preview</h2><span className={e.spacer}/>{result && !state.runError && <span className={e.stats}><RunBadge ms={result.ms} rows={result.rows.length}/></span>}</div>
     <div className={`${e.previewBody} ${counterPreview && !running && !state.runError ? e.center : ''}`}>
      {running ? <div className={e.skel} role="status" aria-label="Running the query"><span className="skel-block"/><span className="skel-line skel-w70"/><span className="skel-line skel-w40"/></div>
       : state.runError ? <p className={e.error} role="alert">{state.runError}</p>
       : result ? <WidgetPreview id="widget-editor-preview" payload={state.draft} query={{ data: result, ms: result.ms, loading: false }}/>
       : <div className={e.empty}><svg width="32" height="32" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><rect x="5" y="6" width="30" height="28" rx="3"/><path d="M12 27v-6M18 27V15M24 27v-9M30 27v-4"/></svg><p>Run the query to see a preview</p>{kbd}</div>}
     </div>
    </section>
    {result && <section className={`${e.card} ${showResults ? '' : e.collapsed}`} aria-label="Query results">
     <div className={e.cardHead}><button type="button" className={e.toggle} aria-expanded={showResults} aria-controls={resultsId} onClick={() => setShowResults(v => !v)}><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>Results</button><span className={e.spacer}/><span className={e.stats}><RunBadge ms={result.ms} rows={result.rows.length}/>{result.columns.map((c, i) => <TypeTag key={i} value={`${c} ${result.types[i] ?? 'other'}`} index={i}/>)}</span></div>
     <div id={resultsId} hidden={!showResults} className={e.tableWrap}><DataTable data={result}/></div>
    </section>}
   </div>
   <aside className={`${e.panel} ${e.side}`} aria-label="Visualization">
    <h2>Visualization</h2>
    <section className={e.group}><h3>Chart type</h3><ChartPicker value={state.draft.chart} onChange={value => dispatch({ type: 'chart', value })}/></section>
    <WidgetSettings state={state} dispatch={dispatch}/>
   </aside>
  </div>
 </div>
}
