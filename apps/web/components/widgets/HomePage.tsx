'use client'
import Link from 'next/link'
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
import { BalanceNotice, signDisabledReason } from './BalanceNotice'
import { WidgetOwnerActions } from './WidgetActionDialog'
import { useWalletBalance } from '../../lib/dash/use-balance'
import type { BalanceLevel } from '../../lib/dash/wallet'
import { canExtendWidget } from '../../lib/dash/widget-actions'
import { ExtendButton } from './ExtendButton'
import { TimeLeft } from './TimeLeft'
import { ChartIcon } from './ChartIcon'
import { EmptyState, PlusIcon, SkeletonCards } from './EmptyState'
import s from '../showcase/showcase.module.css'

export function HomeCollections({ dashboards, widgets, head, onCreate, loading = false, failed = false, payloadError, onRetry, renderExtend, renderDelete }: { dashboards: HomeDashboard[]; widgets: unknown[][]; head?: number; onCreate(): void; loading?: boolean; failed?: boolean; payloadError?: string; onRetry?(): void; renderExtend?(key: string): ReactNode; renderDelete?(key: string): ReactNode }) {
 return <><section><header className="home-heading"><h2>My dashboards</h2><button type="button" className="btn btn-primary" onClick={onCreate}><PlusIcon/>New dashboard</button></header>
  {!loading && !failed && !dashboards.length ? <EmptyState icon="dashboard" title="Create your first dashboard" body="A dashboard is a public page of live charts. Create one, then add your widgets or any public widget to it." actions={<button type="button" className="btn btn-primary" onClick={onCreate}><PlusIcon/>New dashboard</button>}/>
   : <div className="home-dashboards">{dashboards.map(item => <DashboardCard key={item.key} item={item} head={head}/>)}{loading && !failed && !dashboards.length && <SkeletonCards count={3} label="Loading your dashboards…"/>}</div>}
 </section><section><header className="home-heading"><h2>My widgets</h2><Link className="btn" href="/widgets/new"><PlusIcon/>New widget</Link></header>
  <WidgetPayloadError error={payloadError} onRetry={onRetry}/><div className="home-two">{widgets.map(([key, name, chart, expiry]) => <article className={s.card} key={String(key)}><div className="home-widget">
   {CHART_TYPES.includes(chart as ChartType) && <ChartIcon type={chart as ChartType}/>}<strong>{String(name)}</strong><TimeLeft expiresAt={Number(expiry)} head={head}/>{renderExtend?.(String(key))}{renderDelete?.(String(key))}<Link className="btn btn-quiet" href={`/widgets/${String(key)}`}>Open</Link>
  </div></article>)}{loading && !failed && !widgets.length && <SkeletonCards count={2} label="Loading your widgets…"/>}</div>
  {!loading && !failed && !widgets.length && <EmptyState icon="widget" title="No widgets yet" body="A widget is one SQL query with a chart. Write one in a minute and save it; it runs on the live index in your browser." actions={<Link className="btn btn-primary" href="/widgets/new"><PlusIcon/>New widget</Link>}/>}
 </section></>
}
export function HomeHeader({ address, balance }: { address: string; balance: { wei: bigint | null; level: BalanceLevel } }) {
 return <><header className="home-heading"><h1>My home</h1><span className="quiet-chip">{shortHex(address)}</span></header><BalanceNotice address={address} {...balance}/></>
}
export function visibleWidgetRows(rows: unknown[][], pending: PendingWrite[], address: string): unknown[][] {
 return rows.filter(row => {
  const write = pending.find(w => w.kind === 'widget' && w.key === row[0])
  return write?.op !== 'delete' && (typeof write?.fields?.owner !== 'string' || write.fields.owner.toLowerCase() === address.toLowerCase())
 })
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
 const balance = useWalletBalance(address, config.rpcUrl)
 const dashboards = useTimedQuery(myDashboardsSql(config.wallet, address), version)
 const widgets = useTimedQuery(myWidgetsSql(config.wallet, address), version)
 const counts = useTimedQuery(activityCountsSql(config.wallet, address), version)
 const expiring = useTimedQuery(expiringSoonSql(config.wallet, address), version)
 const recent = useTimedQuery(recentSql(config.wallet, address), version)
 const [creating, setCreating] = useState(false)
 useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('new') !== 'dashboard') return
  setCreating(true)
  params.delete('new')
  const query = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash)
 }, [])
 const [payloadError, setPayloadError] = useState<string>()
 const [retry, setRetry] = useState(0)
 const [payloads, setPayloads] = useState<{ scope: string; widgets: Map<string, WidgetEntity> } | null>(null)
 const widgetRows = visibleWidgetRows(widgets.data?.rows ?? [], pending, address)
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
  return <ExtendButton widgetKey={key} expiresAt={expiry} head={state.liveHead} lifetimeDays={widget.widget.lifetimeDays} canExtend={canExtendWidget({ ...widget, expiresAt: expiry }, state.liveHead, address ?? null, config.wallet)} disabledReason={signDisabledReason(balance.level)} onSigned={balance.refresh}/>
 }
 function renderDelete(key: string) {
  const widget = payloads?.scope === scope ? payloads.widgets.get(key) : undefined
  if (!widget || widget.official || widget.owner.toLowerCase() !== address.toLowerCase() || (state.liveHead !== undefined && widget.expiresAt <= state.liveHead)) return null
  return <WidgetOwnerActions widgetKey={key} name={widget.name} address={address} disabledReason={signDisabledReason(balance.level)} onSigned={balance.refresh} onDeleted={result => addPending({key,kind:'widget',op:'delete',afterBlock:result.afterBlock,txHash:result.txHash})}/>
 }
 const countRow = counts.data?.rows[0]
 const activityCounts = countRow ? { live_widgets: Number(countRow[0]), live_dashboards: Number(countRow[1]), placements: Number(countRow[2]), active_days: Number(countRow[3]) } : null
 const error = [dashboards, widgets, counts, expiring, recent].find(q => q.error)?.error ?? state.error
 const loading = [dashboards, widgets, counts, expiring, recent].some(q => showLoading({ loading: q.loading, data: q.data }))
 return <section className="home-page">
  <style>{`.home-page{display:grid;gap:32px;padding:32px 0}.home-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}.home-heading h1,.home-heading h2{margin:0}.home-heading h1{font-size:24px;font-weight:600;letter-spacing:-.02em;line-height:1.25}.home-heading h2{font-size:20px;font-weight:600;letter-spacing:-.015em}.home-heading .btn{min-height:36px}.home-page section>h2{font-size:20px;font-weight:600;letter-spacing:-.015em;margin:0 0 16px}.home-page h3{font-size:15px;font-weight:600}.home-dashboards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.home-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.home-two>article{grid-column:auto}.home-widget{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px}.home-widget strong{flex:1;overflow-wrap:anywhere}.home-page li{margin:12px 0}.home-dialog{max-width:420px;width:calc(100% - 32px);padding:24px;background:var(--card);color:var(--text);border:1px solid var(--border-strong);border-radius:var(--r-lg);box-shadow:var(--shadow-pop)}.home-dialog form,.home-dialog label{display:grid;gap:16px}.home-dialog input{min-height:34px;padding:8px;background:var(--inset);color:var(--text);border:1px solid var(--ui-edge);border-radius:var(--r-md)}.home-two .skel-card{min-height:64px;justify-content:center;padding:16px 0}.home-two .skel-block{display:none}@media(max-width:1100px){.home-dashboards{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.home-dashboards,.home-two{grid-template-columns:minmax(0,1fr)}}`}</style>
  <HomeHeader address={address} balance={balance}/>
  {pending.filter(w => w.kind === 'dashboard' || w.kind === 'widget').map(write => <PendingSync key={write.key} write={write} version={version}/>)}
  {error && <p className="error" role="alert">{error}</p>}
  <HomeCollections dashboards={mergeDashboards(dashboards.data?.rows ?? [], pending)} widgets={widgetRows} head={state.liveHead} onCreate={() => setCreating(true)} payloadError={payloadError} onRetry={() => setRetry(value => value + 1)} loading={loading} failed={!!error} renderExtend={extend} renderDelete={renderDelete}/>
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
