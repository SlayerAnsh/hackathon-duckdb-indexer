'use client'
import { WidgetPayloadError } from './WidgetPayloadError'
import { rpcMessage } from '../RowActions'
import { showLoading } from '../../lib/dash/loading'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useDashAuth } from '../auth/DashAuthProvider'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { activityCountsSql, expiringSoonSql, myDashboardsSql, myWidgetsSql, recentSql } from '../../lib/dash/sql'
import { addPending, usePending, useSynced, type PendingWrite } from '../../lib/dash/pending'
import { mergeDashboards, type HomeDashboard } from '../../lib/dash/home'
import { fetchWidgets } from '../../lib/dash/read'
import { createBrowserRpc } from '../../lib/rpc-browser'
import type { WidgetEntity } from '../../lib/dash/entities'
import { dashApi } from '../../lib/dash/api'
import { saveErrorMessage, withSession } from '../../lib/dash/auth-client'
import { shortHex } from '../../lib/format'
import { CHART_TYPES, type ChartType } from '../../lib/dash/schema'
import { DashboardCard } from './DashboardCard'
import { ActivityPanel } from './ActivityPanel'
import { LoginGate } from './LoginGate'
import { ExtendButton } from './ExtendButton'
import { TimeLeft } from './TimeLeft'
import { ChartIcon } from './ChartIcon'
import s from '../showcase/showcase.module.css'

export function HomeCollections({ dashboards, widgets, head, onCreate, loading = false, payloadError, onRetry, renderExtend }: { dashboards: HomeDashboard[]; widgets: unknown[][]; head?: number; onCreate(): void; loading?: boolean; payloadError?: string; onRetry?(): void; renderExtend?(key: string): ReactNode }) {
 return <><section><header className="home-heading"><h2>My dashboards</h2><button className="btn btn-primary" onClick={onCreate}>+ New dashboard</button></header>
  <div className="home-dashboards">{dashboards.map(item => <DashboardCard key={item.key} item={item} head={head}/>)}</div>
  {!loading && !dashboards.length && <p>No dashboards yet. Create one, then add widgets to it.</p>}
 </section><section><header className="home-heading"><h2>My widgets</h2><a className="btn" href="/widgets/new">+ New widget</a></header>
  <WidgetPayloadError error={payloadError} onRetry={onRetry}/><div className="home-two">{widgets.map(([key, name, chart, expiry]) => <article className={s.card} key={String(key)}><div className="home-widget">
   {CHART_TYPES.includes(chart as ChartType) && <ChartIcon type={chart as ChartType}/>}<strong>{String(name)}</strong><TimeLeft expiresAt={Number(expiry)} head={head}/>{renderExtend?.(String(key))}<a className="btn btn-quiet" href={`/widgets/${String(key)}`}>Open</a>
  </div></article>)}</div>
  {!loading && !widgets.length && <p>No widgets yet. Write a query and save it as your first widget.</p>}
 </section></>
}
function PendingSync({ write, version }: { write: PendingWrite; version: number }) { useSynced(write, version); return null }
function CreateDashboardDialog({ onClose }: { onClose(): void }) {
 const auth = useDashAuth(), router = useRouter()
 const [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null)
 const dialog = useRef<HTMLDialogElement>(null), saving = useRef(false)
 useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus() }, [])
 async function create() {
  if (saving.current || !title.trim()) return
  saving.current = true; setBusy(true); setError(null)
  try {
   const result = await withSession(() => dashApi.createDashboard({ title }), auth.requestLogin)
   if (!result.key) throw new Error('Missing dashboard key')
   addPending({ key: result.key, kind: 'dashboard', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: { title } })
   router.push(`/d/${result.key}/edit`)
   onClose()
  } catch (err) { setError(saveErrorMessage(err)) }
  finally { saving.current = false; setBusy(false) }
 }
 return <dialog ref={dialog} className="home-dialog" aria-labelledby="new-dashboard-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
  <form onSubmit={event => { event.preventDefault(); void create() }}><h2 id="new-dashboard-title">New dashboard</h2><label>Dashboard title<input autoFocus required maxLength={80} value={title} onChange={event => setTitle(event.target.value)} disabled={busy}/></label>
   {error && <p className="error" role="alert">{error}</p>}<div className="home-heading"><button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !title.trim()}>{busy ? 'Saving…' : 'Create dashboard'}</button></div>
  </form></dialog>
}
function AuthenticatedHome() {
 const auth = useDashAuth(), config = auth.config!
 const { state, version } = useIndex(), pending = usePending()
 const address = auth.address!
 const dashboards = useTimedQuery(myDashboardsSql(config.wallet, address), version)
 const widgets = useTimedQuery(myWidgetsSql(config.wallet, address), version)
 const counts = useTimedQuery(activityCountsSql(config.wallet, address), version)
 const expiring = useTimedQuery(expiringSoonSql(config.wallet, address), version)
 const recent = useTimedQuery(recentSql(config.wallet, address), version)
 const [creating, setCreating] = useState(false)
 const [payloadError, setPayloadError] = useState<string>()
 const [retry, setRetry] = useState(0)
 const [payloads, setPayloads] = useState<{ scope: string; widgets: Map<string, WidgetEntity> } | null>(null)
 const widgetRows = (widgets.data?.rows ?? []).filter(row => !pending.some(w => w.kind === 'widget' && w.op === 'delete' && w.key === row[0]))
 const keys = widgetRows.map(row => String(row[0])).join(',')
 const scope = `${config.wallet}|${config.rpcUrl}|${address}`
 useEffect(() => {
  let active = true
  setPayloadError(undefined)
  if (!keys) { setPayloads({ scope, widgets: new Map() }); return }
  void fetchWidgets(createBrowserRpc(config.rpcUrl), config.wallet, keys.split(',')).then(result => { if (active) setPayloads({ scope, widgets: result.widgets }) }).catch(error => { if (active) setPayloadError(rpcMessage(error)) })
  return () => { active = false }
 }, [scope, keys, config.wallet, config.rpcUrl, retry])
 function extend(key: string) {
  const widget = payloads?.scope === scope ? payloads.widgets.get(key) : undefined
  if (!widget) return null
  const write = pending.find(w => w.key === key && w.op === 'upsert')
  const expiry = Math.max(widget.expiresAt, Number(write?.fields?.expiresAt ?? 0))
  return <ExtendButton widgetKey={key} expiresAt={expiry} head={state.liveHead} lifetimeDays={widget.widget.lifetimeDays} canExtend={widget.user === address}/>
 }
 const countRow = counts.data?.rows[0]
 const activityCounts = countRow ? { live_widgets: Number(countRow[0]), live_dashboards: Number(countRow[1]), placements: Number(countRow[2]), active_days: Number(countRow[3]) } : null
 const error = [dashboards, widgets, counts, expiring, recent].find(q => q.error)?.error ?? state.error
 const loading = [dashboards, widgets, counts, expiring, recent].some(q => showLoading({ loading: q.loading, data: q.data }))
 return <section className="home-page">
  <style>{`.home-page{display:grid;gap:32px;padding:32px 0}.home-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}.home-heading h1,.home-heading h2{margin:0}.home-dashboards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.home-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.home-two>article{grid-column:auto}.home-widget{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px}.home-widget strong{flex:1;overflow-wrap:anywhere}.home-page li{margin:12px 0}.home-dialog{max-width:420px;width:calc(100% - 32px);padding:24px;background:var(--card);color:var(--text);border:1px solid var(--border-strong);border-radius:var(--r-lg);box-shadow:var(--shadow-pop)}.home-dialog form,.home-dialog label{display:grid;gap:16px}.home-dialog input{min-height:34px;padding:8px;background:var(--inset);color:var(--text);border:1px solid var(--ui-edge);border-radius:var(--r-md)}@media(max-width:1100px){.home-dashboards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.home-dashboards,.home-two{grid-template-columns:minmax(0,1fr)}}`}</style>
  <header className="home-heading"><h1>My home</h1><span className="quiet-chip">{shortHex(address)}</span></header>
  {pending.filter(w => w.kind === 'dashboard' || w.kind === 'widget').map(write => <PendingSync key={write.key} write={write} version={version}/>)}
  {loading && <p role="status">Loading the index into your browser…</p>}{error && <p className="error" role="alert">{error}</p>}
  <HomeCollections dashboards={mergeDashboards(dashboards.data?.rows ?? [], pending)} widgets={widgetRows} head={state.liveHead} onCreate={() => setCreating(true)} payloadError={payloadError} onRetry={() => setRetry(value => value + 1)} loading={loading || !!error} renderExtend={extend}/>
  <ActivityPanel counts={activityCounts} expiring={expiring.data?.rows ?? []} recent={recent.data?.rows ?? []} head={state.liveHead} renderExtend={extend}/>
  {creating && <CreateDashboardDialog onClose={() => setCreating(false)}/>}
 </section>
}
export function HomePage() {
 const auth = useDashAuth()
 if (auth.status === 'anonymous') return <LoginGate/>
 if (auth.status === 'disabled') return <p>Dashboards are not enabled on this deployment.</p>
 if (auth.status === 'loading' || !auth.config || !auth.address) return <p role="status">Loading the index into your browser…</p>
 return <AuthenticatedHome key={`${auth.config.wallet}|${auth.address}`}/>
}
