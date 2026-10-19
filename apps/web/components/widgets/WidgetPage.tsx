'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDashAuth } from '../auth/DashAuthProvider'
import type { WidgetEntity } from '../../lib/dash/entities'
import { initEditor } from '../../lib/dash/editor-state'
import { usePending } from '../../lib/dash/pending'
import { fetchWidget } from '../../lib/dash/read'
import { isEntityKey, type ChartType, type LifetimeDays, type WidgetPayload, type WriteResult } from '../../lib/dash/schema'
import { checkWidgetSql } from '../../lib/dash/sql-guard'
import { widgetUsageSql, widgetDashboardsSql, toUsedOn } from '../../lib/dash/sql'
import { createBrowserRpc } from '../../lib/rpc-browser'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery, type TimedResult } from '../../lib/use-query'
import { AddressLink } from '../dash/AddressLink'
import { DataTable } from '../dash/DataTable'
import { RunBadge } from '../dash/RunBadge'
import { playgroundHref } from '../dash/WidgetCard'
import { CHART_LABELS } from './ChartPicker'
import { ChartIcon } from './ChartIcon'
import { WidgetEditor } from './WidgetEditor'
import { WidgetPreview } from './WidgetPreview'
import { TimeLeft } from './TimeLeft'
import { ExtendButton } from './ExtendButton'
import { SyncChip } from './SyncChip'
import { AddToDashboardPicker } from './AddToDashboardPicker'
import s from './widgets.module.css'

export type WidgetPageMode = 'loading' | 'missing' | 'owner' | 'viewer'
export function widgetPageMode({ loaded, widget, address, authStatus }: { loaded: boolean; widget: WidgetEntity | null; address?: string; authStatus?: string }): WidgetPageMode {
 return authStatus === 'loading' || !loaded ? 'loading' : !widget ? 'missing' : address?.toLowerCase() === widget.owner.toLowerCase() ? 'owner' : 'viewer'
}
export function widgetLoadState({ authStatus, widget, pending, attempts, loadError }: { authStatus: string; widget: unknown | null; pending: boolean; attempts: number; loadError: boolean }): 'auth' | 'syncing' | 'missing' | 'error' | 'ready' {
 if (authStatus === 'loading') return 'auth'
 if (widget) return 'ready'
 if (pending && attempts < 10) return 'syncing'
 if (loadError && attempts < 3) return 'syncing'
 if (loadError) return 'error'
 return 'missing'
}
export function WidgetPageBody({ state, name }: { state: ReturnType<typeof widgetLoadState>; name?: string }) {
 if (state === 'auth') return <p>Loading the index into your browser…</p>
 if (state === 'syncing') return <section><h1>{name}</h1><span className="state state-disk">Syncing</span><p role="status" aria-live="polite">Saved to Arkiv. The index catches up in a few seconds.</p></section>
 if (state === 'error') return <p className="error">Preview unavailable</p>
 if (state === 'missing') return <MissingWidget/>
 return null
}
export function MissingWidget() { return <section><p>This widget has expired. Its query is no longer on Arkiv.</p><a href="/explore?tab=widgets">Browse widgets</a></section> }
export function ViewerHeader({ name, sql, onAdd }: { name: string; sql: string; onAdd(): void }) {
 return <header className={s.header}><h1>{name}</h1><button className="btn btn-primary" onClick={onAdd}>+ Add to my dashboard</button><a className="btn btn-quiet" href={playgroundHref(sql)}>Open in playground</a></header>
}
async function copyText(text: string, done: () => void) {
 try { await navigator.clipboard.writeText(text); done() } catch { /* Keep the action available for retry. */ }
}
export function WidgetHeader({ name, chart, user, official, uses, expiresAt, head, ms, widgetKey, sql, canAdd, onAdd }: {
 name: string; chart: ChartType; user: string; official: boolean; uses: number; expiresAt: number; head?: number; ms?: number; widgetKey: string; sql: string; canAdd: boolean; onAdd?(): void
}) {
 const [copied, setCopied] = useState(false)
 useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer) } }, [copied])
 return <header className={s.widgetHeader}>
  <nav aria-label="Breadcrumb"><a href="/explore">Explore</a> / <a href="/explore?tab=widgets">Widgets</a> / <span>{name}</span></nav>
  <div className={s.titleRow}><h1>{name}</h1><span className="chip"><ChartIcon type={chart}/>{CHART_LABELS[chart]}</span></div>
  <div className={s.facts}>by {official ? <><span className="chip chip-official">⛨ Official</span> Arkiv SQL Indexer</> : <AddressLink address={user}/>}<span>on {uses} dashboards</span>{official ? <span className="chip">◷ Kept live</span> : <TimeLeft expiresAt={expiresAt} head={head}/>}<span className={s.live}><i aria-hidden="true"/>Live, computed in your browser</span>{ms !== undefined && <RunBadge ms={ms}/>}</div>
  <div className={s.widgetActions}><button className="btn btn-quiet" onClick={() => void copyText(`${location.origin}/widgets/${widgetKey}`, () => setCopied(true))}>{copied ? '✓ Link copied' : 'Copy link'}</button><span className={s.srOnly} aria-live="polite">{copied ? 'Link copied' : ''}</span><a className="btn" href={playgroundHref(sql)}>Open in playground</a>{canAdd && <button className="btn btn-primary" onClick={onAdd}>+ Add to dashboard</button>}</div>
 </header>
}
export function UsedOnPanel({ items, total, expanded = false }: { items: ReturnType<typeof toUsedOn>; total: number; expanded?: boolean }) {
 const [open, setOpen] = useState(expanded)
 return <section className={s.panel}><h2>Used on {total} dashboards</h2><ul className={s.uses}>{(open ? items : items.slice(0, 4)).map(item => <li key={item.key}><a href={`/d/${item.key}`}><span><strong>{item.title}</strong><small>{item.widgets} widgets</small></span>{item.official && <span className="chip chip-official">⛨ Official</span>}</a></li>)}</ul>{!open && total > 4 && <button className="btn btn-quiet" aria-expanded={false} onClick={() => setOpen(true)}>Show all {total}</button>}</section>
}
export function LifetimePanel({ official, expiresAt, head, lifetimeDays, widgetKey, canExtend, reason, onExtended }: {
 official: boolean; expiresAt: number; head?: number; lifetimeDays: LifetimeDays; widgetKey: string; canExtend: boolean; reason?: string; onExtended?(result: WriteResult): void
}) {
 return <section className={s.panel}><h2>Lifetime</h2>{official ? <span className="chip">◷ Kept live</span> : <><TimeLeft expiresAt={expiresAt} head={head}/><p>Lives for {lifetimeDays} days per extend</p></>}<p className={s.entityKey}>{widgetKey}</p>{!official && <>{canExtend && <div className={s.extend}><ExtendButton widgetKey={widgetKey} expiresAt={expiresAt} head={head} lifetimeDays={lifetimeDays} canExtend={canExtend} label={`Extend by ${lifetimeDays} days`} onExtended={onExtended}/></div>}<p>{reason ?? (canExtend ? 'You can extend widgets you created or added to one of your dashboards.' : 'Add this widget to your dashboard to extend it.')}</p></>}</section>
}
type Runner = (sql: string, version: number, control: { maxRows: number }) => TimedResult
function StoredQuery({ payload, version, run, onTiming }: { payload: WidgetPayload; version: number; run: Runner; onTiming?(ms?: number): void }) {
 const query = run(payload.sql, version, { maxRows: 5000 })
 const [table, setTable] = useState(false), [copied, setCopied] = useState(false)
 useEffect(() => { onTiming?.(query.ms) }, [query.ms, onTiming])
 useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer) } }, [copied])
 return <div className={s.widgetMain}><section className={s.panel} aria-label="Widget preview"><div className={s.segment} role="group" aria-label="Preview view"><button aria-pressed={!table} onClick={() => setTable(false)}>Chart</button><button aria-pressed={table} onClick={() => setTable(true)}>Table</button></div>{table ? query.data ? <div className={s.table}><DataTable data={query.data}/></div> : <p>{query.error ? 'Preview unavailable' : 'Loading the index into your browser…'}</p> : <WidgetPreview id="saved-widget-preview" payload={payload} query={query}/>}</section><section className={s.panel}><div className={s.titleRow}><h2>SQL</h2><button className="btn btn-quiet" onClick={() => void copyText(payload.sql, () => setCopied(true))}>{copied ? '✓ SQL copied' : 'Copy SQL'}</button><span className={s.srOnly} aria-live="polite">{copied ? 'SQL copied' : ''}</span></div><pre className={s.readSql} tabIndex={0}><code>{payload.sql}</code></pre></section></div>
}
export function StoredWidgetPreview({ payload, version, run = useTimedQuery, onTiming }: { payload: WidgetPayload; version: number; run?: Runner; onTiming?(ms?: number): void }) {
 const reason = checkWidgetSql(payload.sql)
 if (reason) return <p className="error">{reason}</p>
 return <StoredQuery payload={payload} version={version} run={run} onTiming={onTiming}/>
}
export function WidgetPage({ widgetKey }: { widgetKey: string }) {
 const key = widgetKey.toLowerCase(), auth = useDashAuth(), config = auth.config
 const { version, state } = useIndex()
 const [record, setRecord] = useState<{ key: string; widget: WidgetEntity | null; head: number } | null>(null)
 const [loadError, setLoadError] = useState<string | null>(null)
 const [refresh, setRefresh] = useState(0), [editorRevision, setEditorRevision] = useState(0)
 const [attemptState, setAttemptState] = useState({ key, count: 0 })
 const attempts = attemptState.key === key ? attemptState.count : 0
 const [ms, setMs] = useState<number | undefined>(undefined)
 const [picker, setPicker] = useState(false)
 const closePicker = useCallback(() => setPicker(false), [])
 const latestLocal = useRef<{ key: string; txHash: string; afterBlock: number; updatedAt?: number } | null>(null)
 const sequence = useRef(0)
 const pending = usePending()
 const write = pending.find(p => p.key === key && p.kind === 'widget' && p.op === 'upsert')
 const widget = record?.key === key ? record.widget : null
 const loadState = widgetLoadState({ authStatus: auth.status, widget, pending: !!write, attempts, loadError: !!loadError })
 const usage = useTimedQuery(config?.enabled && isEntityKey(key) ? widgetUsageSql(config.wallet, key, auth.address ?? null) : 'SELECT 0, false', version)
 const usedOn = useTimedQuery(config?.enabled && isEntityKey(key) ? widgetDashboardsSql(config.wallet, key, Number.MAX_SAFE_INTEGER) : 'SELECT NULL WHERE false', version)
 useEffect(() => {
  const current = ++sequence.current
  setLoadError(null)
  if (!config?.enabled) return
  if (!isEntityKey(key)) { setRecord({ key, widget: null, head: 0 }); return }
  void fetchWidget(createBrowserRpc(config.rpcUrl), config.wallet, key).then(result => {
   if (sequence.current !== current) return
   setRecord(previous => {
    // An RPC replica may lag behind a successful local write.
    localTxSeen(result.widget)
    const local = latestLocal.current
    if (previous?.key === key && previous.widget && local?.key === key && (!result.widget || result.widget.updatedAt <= local.afterBlock)) return previous
    if (previous?.key === key && previous.widget && result.widget && result.widget.updatedAt < previous.widget.updatedAt) return previous
    return { key, ...result }
   })
  }).catch(() => { if (sequence.current === current) setLoadError('Preview unavailable') })
  return () => { sequence.current++ }
 }, [key, config?.enabled, config?.wallet, config?.rpcUrl, refresh])
 useEffect(() => {
  if (loadState !== 'syncing' || !config?.enabled) return
  const timer = setTimeout(() => {
   setAttemptState(previous => ({ key, count: (previous.key === key ? previous.count : 0) + 1 }))
   setRefresh(n => n + 1)
  }, 2000)
  return () => clearTimeout(timer)
 }, [loadState, key, config?.enabled, refresh])
 function localTxSeen(value: WidgetEntity | null) {
  const local = latestLocal.current
  if (local?.key === key && local.updatedAt === undefined && value && value.updatedAt > local.afterBlock) local.updatedAt = value.updatedAt
 }
 function written(result: WriteResult, payload?: WidgetPayload) {
  sequence.current++
  latestLocal.current = { key, txHash: result.txHash, afterBlock: result.afterBlock }
  setRecord(previous => previous?.key === key && previous.widget ? { ...previous, widget: { ...previous.widget, ...(payload ? { widget: payload, name: payload.name, chart: payload.chart } : {}), expiresAt: result.expiresAt ?? previous.widget.expiresAt } } : previous)
  if (payload) setEditorRevision(n => n + 1)
  setRefresh(n => n + 1)
 }
 async function openPicker() {
  if (auth.status !== 'authenticated' && !await auth.requestLogin()) return
  setPicker(true)
 }
 const mode = widgetPageMode({ loaded: record?.key === key, widget, address: auth.address, authStatus: auth.status })
 if (!config) return <p>Loading the index into your browser…</p>
 if (!config.enabled) return <p>Dashboards are not enabled on this deployment.</p>
 if (loadState !== 'ready') return <WidgetPageBody state={loadState} name={write?.fields?.name === undefined ? undefined : String(write.fields.name)}/>
 if (mode === 'loading') return <p>Loading the index into your browser…</p>
 const head = Math.max(record?.head ?? 0, state.liveHead ?? 0)
 if (!widget) return <MissingWidget/>
 const name = String(write?.fields?.name ?? widget.widget.name)
 const expiresAt = Math.max(widget.expiresAt, Number(write?.fields?.expiresAt ?? widget.expiresAt))
 if (expiresAt <= head) return <MissingWidget/>
 const official = widget.official
 const owner = mode === 'owner' && !official
 const uses = Number(usage.data?.rows[0]?.[0] ?? 0)
 return <div className={s.editor}>
  <WidgetHeader name={name} chart={widget.chart} user={widget.user} official={official} uses={uses} expiresAt={expiresAt} head={head} ms={ms} widgetKey={key} sql={widget.widget.sql} canAdd onAdd={() => void openPicker()}/>
  <SyncChip write={write} version={version}/>
  <div className={s.widgetColumns}>
   {owner ? <WidgetEditor key={`${key}:${editorRevision}`} mode="edit" widgetKey={key} initial={initEditor({ ...widget.widget, name })} onSaved={written}/> : <StoredWidgetPreview key={key} payload={widget.widget} version={version} onTiming={setMs}/>}
   <aside><UsedOnPanel key={key} items={toUsedOn(usedOn.data?.rows ?? [], config.wallet)} total={uses}/><LifetimePanel official={official} expiresAt={expiresAt} head={head} lifetimeDays={widget.widget.lifetimeDays} widgetKey={key} canExtend={owner || usage.data?.rows[0]?.[1] === true} onExtended={written}/></aside>
  </div>
  {auth.error && <p className="error">{auth.error}</p>}
  {picker && auth.status === 'authenticated' && <AddToDashboardPicker widgetKey={key} chart={widget.widget.chart} onClose={closePicker}/>}
 </div>
}
