'use client'
import Link from 'next/link'
import { showLoading } from '../../lib/dash/loading'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useDashAuth } from '../auth/DashAuthProvider'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { activityCountsSql, expiringSoonSql, myDashboardsSql, myWidgetsSql, recentSql } from '../../lib/dash/sql'
import { addPending, usePending, useSynced, type PendingWrite } from '../../lib/dash/pending'
import { homeWidgetItems, mergeDashboards, type HomeDashboard } from '../../lib/dash/home'
import { useWidgetEntities, entityRev } from '../../lib/dash/entity-cache'
import { dashApi } from '../../lib/dash/api'
import { saveErrorMessage, withSession } from '../../lib/dash/auth-client'
import { shortHex } from '../../lib/format'
import type { WidgetEntity } from '../../lib/dash/entities'
import type { WidgetListItem } from '../../lib/dash/sql'
import { useCoverPayloads } from '../../lib/dash/use-cover-payloads'
import { DashboardCard } from './DashboardCard'
import { ActivityPanel } from './ActivityPanel'
import { LoginGate } from './LoginGate'
import { BalanceNotice, signDisabledReason } from './BalanceNotice'
import { WidgetOwnerActions } from './WidgetActionDialog'
import { useWalletBalance } from '../../lib/dash/use-balance'
import type { BalanceLevel } from '../../lib/dash/wallet'
import { canExtendWidget } from '../../lib/dash/widget-actions'
import { ExtendButton } from './ExtendButton'
import { WidgetBrowseCard, WidgetOwnerFoot } from './WidgetBrowseCard'
import { EmptyState, PlusIcon, SkeletonCards } from './EmptyState'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import h from './home.module.css'
import e from '../explore/explore.module.css'

export function SectionHead({ id, title, count, sub, actions }: { id: string; title: string; count?: number; sub?: ReactNode; actions?: ReactNode }) {
 return <header className={h.head}><div className={h.headText}><h2 id={id}>{title}{count !== undefined && count > 0 && <span className="badge">{count}</span>}</h2>{sub && <p>{sub}</p>}</div>{actions && <div className={h.headActions}>{actions}</div>}</header>
}
export function RetryNotice({ error, onRetry }: { error?: string; onRetry?(): void }) {
 if (!error) return null
 return <div className={`notice notice-bad ${h.retry}`} role="alert"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M8 4.75v3.75M8 11h.01"/></svg><div><span>{error}</span>{onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}>Try again</button>}</div></div>
}
export function HomeCollections({ dashboards, widgets, address, head, version = 0, payloads, onCreate, loading = false, failed = false, payloadError, onRetry, renderExtend, renderDelete }: { dashboards: HomeDashboard[]; widgets: WidgetListItem[]; address: string; head?: number; version?: number; payloads?: Map<string, WidgetEntity | null>; onCreate(): void; loading?: boolean; failed?: boolean; payloadError?: string; onRetry?(): void; renderExtend?(key: string): ReactNode; renderDelete?(key: string): ReactNode }) {
 const covers = useCoverPayloads(dashboards)
 const settled = !loading && !failed
 return <>
  <section className={h.section} aria-labelledby="home-dashboards">
   <SectionHead id="home-dashboards" title="My dashboards" count={settled ? dashboards.length : undefined} sub="Public pages of live charts. Anyone with the link can open them."
    actions={<button type="button" className="btn btn-primary" onClick={onCreate}><PlusIcon/>New dashboard</button>}/>
   {settled && !dashboards.length ? <EmptyState icon="dashboard" title="Create your first dashboard" body="A dashboard is a public page of live charts. Create one, then add your widgets or any public widget to it." actions={<button type="button" className="btn btn-primary" onClick={onCreate}><PlusIcon/>New dashboard</button>}/>
    : <div className={e.grid}>{dashboards.map(item => <DashboardCard key={item.key} item={item} user={address} head={head} coverPayload={covers ? covers.get(item.cover ?? "") ?? null : undefined}/>)}{loading && !failed && !dashboards.length && <SkeletonCards count={3} label="Loading your dashboards…"/>}</div>}
  </section>
  <section className={h.section} aria-labelledby="home-widgets">
   <SectionHead id="home-widgets" title="My widgets" count={settled ? widgets.length : undefined} sub="Saved SQL queries with a chart. Extend them before they expire."
    actions={<Link className="btn btn-outline" href="/widgets/new"><PlusIcon/>New widget</Link>}/>
   <RetryNotice error={payloadError} onRetry={onRetry}/>
   {(widgets.length > 0 || (loading && !failed)) && <div className={e.widgetGrid}>{widgets.map(item => <WidgetBrowseCard key={item.key} item={item} payload={payloads ? payloads.get(item.key) ?? null : undefined} head={head} version={version} variant="explorer"
    foot={<WidgetOwnerFoot href={`/widgets/${item.key}`}>{renderExtend?.(item.key)}{renderDelete?.(item.key)}</WidgetOwnerFoot>}/>)}{loading && !failed && !widgets.length && <SkeletonCards count={3} tall label="Loading your widgets…"/>}</div>}
   {settled && !widgets.length && <EmptyState icon="widget" title="No widgets yet" body="A widget is one SQL query with a chart. Write one in a minute and save it; it runs on the live index in your browser." actions={<Link className="btn btn-primary" href="/widgets/new"><PlusIcon/>New widget</Link>}/>}
  </section>
 </>
}
export function HomeHeader({ address, balance }: { address: string; balance: { wei: bigint | null; level: BalanceLevel } }) {
 return <div className={h.top}>
  <header className={h.pageHead}><div><h1>My home</h1><p className={h.pageSub}>Everything owned by <span className={h.addr} title={address}>{shortHex(address)}</span></p></div></header>
  <BalanceNotice address={address} {...balance}/>
 </div>
}
export function visibleWidgetRows(rows: unknown[][], pending: PendingWrite[], address: string): unknown[][] {
 return rows.filter(row => {
  const write = pending.find(w => w.kind === 'widget' && w.key === row[0])
  return write?.op !== 'delete' && (typeof write?.fields?.owner !== 'string' || write.fields.owner.toLowerCase() === address.toLowerCase())
 })
}
function PendingSync({ write, version }: { write: PendingWrite; version: number }) { useSynced(write, version); return null }
const TITLE_MAX = 80
function CreateDashboardDialog({ open, onClose }: { open: boolean; onClose(): void }) {
 const auth = useDashAuth(), router = useRouter()
 const [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [touched, setTouched] = useState(false)
 const saving = useRef(false)
 useEffect(() => { if (open) { setTitle(''); setError(null); setTouched(false) } }, [open])
 const trimmed = title.trim()
 const invalid = touched && !trimmed ? 'Give the dashboard a title.' : null
 async function create() {
  setTouched(true)
  if (saving.current || !trimmed) return
  saving.current = true; setBusy(true); setError(null)
  try {
   const result = await withSession(() => dashApi.createDashboard({ title: trimmed }), auth.requestLogin)
   if (!result.key) throw new Error('Missing dashboard key')
   addPending({ key: result.key, kind: 'dashboard', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: { title: trimmed } })
   router.push(`/d/${result.key}/edit`)
   onClose()
  } catch (err) { setError(saveErrorMessage(err)) }
  finally { saving.current = false; setBusy(false) }
 }
 return <Dialog open={open} onClose={onClose} size="sm" dismissible={!busy} title="New dashboard" description="Name it now; you add widgets on the next screen. You can rename it later."
  footer={<>
   <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
   <button type="submit" form="new-dashboard-form" className="btn btn-primary" disabled={busy} aria-busy={busy || undefined}>{busy ? <><span className="spinner" aria-hidden="true"/>Creating…</> : 'Create dashboard'}</button>
  </>}>
  <form id="new-dashboard-form" className="field-stack" noValidate onSubmit={event => { event.preventDefault(); void create() }}>
   <Field label="Title" error={invalid} hint={invalid ? undefined : `${trimmed.length}/${TITLE_MAX} characters. Shown on the card and the public page.`}>
    <input className="input" data-autofocus="true" maxLength={TITLE_MAX} placeholder="Tiramisu activity" autoComplete="off" value={title} onChange={event => setTitle(event.target.value)} onBlur={() => { if (title) setTouched(true) }} disabled={busy}/>
   </Field>
   {error && <div className="notice notice-bad" role="alert"><div><p>{error}</p></div></div>}
  </form>
 </Dialog>
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
 const widgetRows = visibleWidgetRows(widgets.data?.rows ?? [], pending, address)
 const widgetItems = homeWidgetItems(widgetRows, address)
 const entities = useWidgetEntities(widgetItems.map(item => item.key), new Map(widgetItems.map(item => [item.key, entityRev(item)])))
 const payloadError = entities.error
 function extend(key: string) {
  const widget = entities.data?.get(key)
  if (!widget) return null
  const write = pending.find(w => w.key === key && w.op === 'upsert')
  const expiry = Math.max(widget.expiresAt, Number(write?.fields?.expiresAt ?? 0))
  return <ExtendButton widgetKey={key} expiresAt={expiry} head={state.liveHead} lifetimeDays={widget.widget.lifetimeDays} canExtend={canExtendWidget({ ...widget, expiresAt: expiry }, state.liveHead, address ?? null, config.wallet)} disabledReason={signDisabledReason(balance.level)} onSigned={balance.refresh}/>
 }
 function renderDelete(key: string) {
  const widget = entities.data?.get(key)
  if (!widget || widget.official || widget.owner.toLowerCase() !== address.toLowerCase() || (state.liveHead !== undefined && widget.expiresAt <= state.liveHead)) return null
  return <WidgetOwnerActions widgetKey={key} name={widget.name} address={address} disabledReason={signDisabledReason(balance.level)} onSigned={balance.refresh} onDeleted={result => addPending({key,kind:'widget',op:'delete',afterBlock:result.afterBlock,txHash:result.txHash})}/>
 }
 const countRow = counts.data?.rows[0]
 const activityCounts = countRow ? { live_widgets: Number(countRow[0]), live_dashboards: Number(countRow[1]), placements: Number(countRow[2]), active_days: Number(countRow[3]) } : null
 const error = [dashboards, widgets, counts, expiring, recent].find(q => q.error)?.error ?? state.error
 const loading = [dashboards, widgets, counts, expiring, recent].some(q => showLoading({ loading: q.loading, data: q.data }))
 return <div className={h.page}>
  {pending.filter(w => w.kind === 'dashboard' || w.kind === 'widget').map(write => <PendingSync key={write.key} write={write} version={version}/>)}
  <div className={h.top}><HomeHeader address={address} balance={balance}/>
   {error && <div className="notice notice-bad" role="alert"><div><p className="notice-title">The index could not load your items</p><p>{error}</p></div></div>}
  </div>
  <HomeCollections dashboards={mergeDashboards(dashboards.data?.rows ?? [], pending)} widgets={widgetItems} address={address} head={state.liveHead} version={version} payloads={entities.data} onCreate={() => setCreating(true)} payloadError={payloadError} onRetry={entities.refetch} loading={loading} failed={!!error} renderExtend={extend} renderDelete={renderDelete}/>
  <ActivityPanel counts={activityCounts} expiring={expiring.data?.rows ?? []} recent={recent.data?.rows ?? []} head={state.liveHead} renderExtend={extend}/>
  <CreateDashboardDialog open={creating} onClose={() => setCreating(false)}/>
 </div>
}
export function HomePage() {
 const auth = useDashAuth()
 if (auth.status === 'anonymous') return <LoginGate/>
 if (auth.status === 'disabled') return <p className={h.status}>Dashboards are not enabled on this deployment.</p>
 if (auth.status === 'loading' || !auth.config || !auth.address) return <p className={h.status} role="status"><span className="spinner" aria-hidden="true"/>Loading the index into your browser…</p>
 return <AuthenticatedHome key={`${auth.config.wallet}|${auth.address}`}/>
}
