'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDashAuth } from '../auth/DashAuthProvider'
import type { WidgetEntity } from '../../lib/dash/entities'
import { initEditor } from '../../lib/dash/editor-state'
import { usePending } from '../../lib/dash/pending'
import { fetchWidget } from '../../lib/dash/read'
import { isEntityKey, type WidgetPayload, type WriteResult } from '../../lib/dash/schema'
import { checkWidgetSql } from '../../lib/dash/sql-guard'
import { widgetUsageSql } from '../../lib/dash/sql'
import { createBrowserRpc } from '../../lib/rpc-browser'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery, type TimedResult } from '../../lib/use-query'
import { shortHex } from '../../lib/format'
import { AddressLink } from '../dash/AddressLink'
import { DataTable } from '../dash/DataTable'
import { RunBadge } from '../dash/RunBadge'
import { SqlBlock } from '../dash/SqlBlock'
import { playgroundHref } from '../dash/WidgetCard'
import { WidgetEditor } from './WidgetEditor'
import { WidgetPreview } from './WidgetPreview'
import { TimeLeft } from './TimeLeft'
import { ExtendButton } from './ExtendButton'
import { SyncChip } from './SyncChip'
import { AddToDashboardPicker } from './AddToDashboardPicker'
import s from './widgets.module.css'

export type WidgetPageMode = 'loading' | 'missing' | 'owner' | 'viewer'
export function widgetPageMode({ loaded, widget, address, authStatus }: { loaded: boolean; widget: WidgetEntity | null; address?: string; authStatus?: string }): WidgetPageMode {
 return authStatus === 'loading' || !loaded ? 'loading' : !widget ? 'missing' : address?.toLowerCase() === widget.user.toLowerCase() ? 'owner' : 'viewer'
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
type Runner = (sql: string, version: number, control: { maxRows: number }) => TimedResult
function StoredQuery({ payload, version, run }: { payload: WidgetPayload; version: number; run: Runner }) {
 const query = run(payload.sql, version, { maxRows: 5000 })
 return <><section className={s.settings} aria-label="Widget preview"><WidgetPreview id="saved-widget-preview" payload={payload} query={query}/></section><SqlBlock sql={payload.sql}/><section className={s.results}><div className={s.meta}><RunBadge ms={query.ms} rows={query.data?.rows.length}/>{query.data && <span>{query.data.rows.length} rows</span>}</div>{query.data && <div className={s.table}><DataTable data={query.data}/></div>}</section></>
}
export function StoredWidgetPreview({ payload, version, run = useTimedQuery }: { payload: WidgetPayload; version: number; run?: Runner }) {
 const reason = checkWidgetSql(payload.sql)
 if (reason) return <p className="error">{reason}</p>
 return <StoredQuery payload={payload} version={version} run={run}/>
}
export function WidgetPage({ widgetKey }: { widgetKey: string }) {
 const key = widgetKey.toLowerCase(), auth = useDashAuth(), config = auth.config
 const { version, state } = useIndex()
 const [record, setRecord] = useState<{ key: string; widget: WidgetEntity | null; head: number } | null>(null)
 const [loadError, setLoadError] = useState<string | null>(null)
 const [refresh, setRefresh] = useState(0), [editorRevision, setEditorRevision] = useState(0)
 const [attemptState, setAttemptState] = useState({ key, count: 0 })
 const attempts = attemptState.key === key ? attemptState.count : 0
 const [picker, setPicker] = useState(false)
 const closePicker = useCallback(() => setPicker(false), [])
 const latestLocal = useRef<{ key: string; txHash: string; afterBlock: number; updatedAt?: number } | null>(null)
 const sequence = useRef(0)
 const pending = usePending()
 const write = pending.find(p => p.key === key && p.kind === 'widget' && p.op === 'upsert')
 const widget = record?.key === key ? record.widget : null
 const loadState = widgetLoadState({ authStatus: auth.status, widget, pending: !!write, attempts, loadError: !!loadError })
 const usage = useTimedQuery(config?.enabled && isEntityKey(key) ? widgetUsageSql(config.wallet, key, auth.address ?? null) : 'SELECT 0, false', version)
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
 const localTx = latestLocal.current?.key === key && (latestLocal.current.updatedAt === undefined || widget.updatedAt === latestLocal.current.updatedAt) ? latestLocal.current.txHash : undefined
 const txHash = write?.txHash && widget.updatedAt <= write.afterBlock ? write.txHash : localTx
 const meta = <div className={s.meta}>by <AddressLink address={widget.user}/><TimeLeft expiresAt={expiresAt} head={head}/><ExtendButton widgetKey={key} expiresAt={expiresAt} head={head} lifetimeDays={widget.widget.lifetimeDays} canExtend={mode === 'owner' || usage.data?.rows[0]?.[1] === true} onExtended={written}/>{txHash && <span title={txHash}>tx {shortHex(txHash)}</span>}<span>on {Number(usage.data?.rows[0]?.[0] ?? 0)} dashboards</span><SyncChip write={write} version={version}/></div>
 return <div className={s.editor}>
  {mode === 'owner' ? <>{meta}<WidgetEditor key={`${key}:${editorRevision}`} mode="edit" widgetKey={key} initial={initEditor({ ...widget.widget, name })} onSaved={written}/></> : <><ViewerHeader name={name} sql={widget.widget.sql} onAdd={() => void openPicker()}/>{meta}<StoredWidgetPreview key={key} payload={widget.widget} version={version}/></>}
  {auth.error && <p className="error">{auth.error}</p>}
  {picker && auth.status === 'authenticated' && <AddToDashboardPicker widgetKey={key} chart={widget.widget.chart} onClose={closePicker}/>}
 </div>
}
