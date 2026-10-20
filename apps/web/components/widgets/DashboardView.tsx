'use client'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { useDashAuth } from '../auth/DashAuthProvider'
import { AddressLink } from '../dash/AddressLink'
import { useDashboard } from '../../lib/dash/use-dashboard'
import { dashboardSlots } from '../../lib/dash/slots'
import { usePending } from '../../lib/dash/pending'
import { useIndex } from '../../lib/use-index'
import { SavedWidgetCard } from './SavedWidgetCard'
import { SyncChip } from './SyncChip'
import { ShareMenu } from './ShareMenu'
import { EmptyState, PlusIcon } from './EmptyState'
import { figureNumbers, importedFrom, updatedLabel } from '../../lib/dash/report'
import s from './report.module.css'

export const ShieldIcon = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M8 1.5 2.5 3.5v4c0 3.4 2.3 5.8 5.5 7 3.2-1.2 5.5-3.6 5.5-7v-4Z"/></svg>
const PencilIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="m10 2.5 3.5 3.5L6 13.5H2.5V10z"/></svg>

export function ReportHeader({ title, description, user, official, count, owner, dashboardKey, updatedAt, head }: {
 title: string; description: string; user: string; official: boolean; count: number; owner: boolean; dashboardKey: string; updatedAt: number; head: number
}) {
 return <header className={s.header}>
  <nav className={s.breadcrumb} aria-label="Breadcrumb"><ol>
   <li><Link href="/explore">Explore</Link></li>
   <li><Link href="/explore?tab=dashboards">Dashboards</Link></li>
   <li aria-current="page"><span>{title}</span></li>
  </ol></nav>
  <div className={s.top}>
   <div className={s.eyebrow}>{official ? <><span className="chip chip-official"><ShieldIcon/>Featured</span><span>Dashboard</span></> : 'Dashboard'}</div>
   <div className={s.tools} role="toolbar" aria-label="Dashboard actions">
    {owner && !official && <>
     <Link className="btn btn-sm btn-quiet" aria-label="Organize dashboard" href={'/d/' + dashboardKey + '/edit'}><PencilIcon/><span className={s.toolLabel}>Organize</span></Link>
     <Link className="btn btn-sm btn-quiet" aria-label="Add widgets" href={'/d/' + dashboardKey + '/edit?import=1'}><PlusIcon/><span className={s.toolLabel}>Add widgets</span></Link>
     <span className={s.toolSep} aria-hidden="true"/>
    </>}
    <ShareMenu title={title} dashboardKey={dashboardKey}/>
   </div>
  </div>
  <h1 className={s.title}>{title}</h1>
  {description.trim() && <p className={s.description}>{description}</p>}
  <div className={s.meta}>
   <span>By <AddressLink address={user}/></span>
   <span>{count} {count === 1 ? 'widget' : 'widgets'}</span>
   <span><i className={s.pulse} aria-hidden="true"/>Live, computed in your browser</span>
   <span>{updatedLabel(updatedAt, head)}</span>
  </div>
 </header>
}

export function EmptyDashboard({ owner, dashboardKey }: { owner: boolean; dashboardKey: string }) {
 return <div className={s.state}>{owner
  ? <EmptyState icon="dashboard" title="This dashboard is empty" body="Import widgets you or others have saved, or write a new one in SQL. Each widget runs live in the reader's browser."
   actions={<><Link className="btn btn-primary" href={'/d/' + dashboardKey + '/edit?import=1'}><PlusIcon/>Add widget</Link><Link className="btn" href={'/widgets/new?dashboard=' + dashboardKey}>New widget</Link></>}/>
  : <EmptyState icon="dashboard" title="No widgets yet" body="Its owner has not placed any widgets. Public widgets are listed on Explore."
   actions={<Link className="btn" href="/explore?tab=widgets">Browse widgets</Link>}/>}
 </div>
}
export function MissingDashboard({ expired = false }: { expired?: boolean }) {
 return <div className={`${s.page} ${s.state}`}>
  <EmptyState icon="dashboard" title={expired ? 'This dashboard has expired' : 'Dashboard not found'}
   body={expired ? 'Its time on Arkiv ran out. Widgets it used may still be live on their own.' : 'It may have expired or the link is wrong.'}
   actions={<><Link className="btn btn-primary" href="/explore?tab=dashboards">Browse dashboards</Link><Link className="btn" href="/explore?tab=widgets">Browse widgets</Link></>}/>
 </div>
}
/** Report shaped placeholder shown while the dashboard and its widgets load. */
export function DashboardSkeleton({ label = 'Loading the dashboard' }: { label?: string }) {
 return <div className={s.page} aria-busy="true">
  <span className="sr-only" role="status">{label}</span>
  <div className={s.header} aria-hidden="true">
   <span className={`skel ${s.skBread}`}/>
   <span className={`skel ${s.skEyebrow}`}/>
   <span className={`skel ${s.skTitle}`}/>
   <span className={`skel ${s.skDesc}`}/>
   <span className={`skel ${s.skMeta}`}/>
  </div>
  <div className={s.grid} aria-hidden="true">
   {[3, 3, 3, 3, 6, 6].map((span, i) => <div key={i} className={`${s.figure} ${s.skFigure}`} style={{ '--lg': span, '--md': span === 3 ? 6 : 12, '--sm': 12 } as CSSProperties}>
    <span className={`skel ${s.skCaption}`}/>
    <span className={`skel ${span === 3 ? s.skValue : s.skChart}`}/>
   </div>)}
  </div>
 </div>
}
export function DashboardNotice({ tone, title, body, onRetry }: { tone: 'bad' | 'info'; title: string; body?: string; onRetry?(): void }) {
 return <div className={`${s.page} ${s.state}`}>
  <div className={`notice notice-${tone} ${s.notice}`} role={tone === 'bad' ? 'alert' : 'status'}>
   <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d={tone === 'bad' ? 'M8 4.5v4M8 11h.01' : 'M8 7.5v4M8 5h.01'}/></svg>
   <div><p className="notice-title">{title}</p>{body && <p>{body}</p>}
    {onRetry && <div className="notice-actions"><button type="button" className="btn btn-sm" onClick={onRetry}>Try again</button></div>}</div>
  </div>
 </div>
}

export function DashboardView({ dashboardKey }: { dashboardKey: string }) {
 const key = dashboardKey.toLowerCase()
 const auth = useDashAuth()
 const data = useDashboard(key)
 const { state, version } = useIndex()
 const pending = usePending()
 const write = pending.find(entry => entry.key === key && entry.kind === 'dashboard')
 if (!auth.config) return <DashboardSkeleton/>
 if (!auth.config.enabled) return <DashboardNotice tone="info" title="Dashboards are not enabled on this deployment." body="The SQL playground still works."/>
 if (data.status === 'loading') return <DashboardSkeleton/>
 if (data.status === 'error') return <DashboardNotice tone="bad" title="Could not load this dashboard" body={data.error} onRetry={data.reload}/>
 const head = Math.max(data.head ?? 0, state.liveHead ?? 0)
 if (!data.dashboard) return <MissingDashboard/>
 if (data.dashboard.expiresAt <= head) return <MissingDashboard expired/>
 const owner = !data.dashboard.official && data.dashboard.user === auth.address
 const slots = dashboardSlots(data.links, data.widgets).map(slot => ({
  ...slot, status: slot.widget && slot.widget.expiresAt <= head ? 'expired' as const : slot.status,
 }))
 const numbers = figureNumbers(slots.map(slot => ({ id: slot.id, status: slot.status, chart: slot.widget?.chart ?? null })))
 return <div className={s.page}>
  <ReportHeader description={data.dashboard.dashboard.description} official={data.dashboard.official} updatedAt={data.dashboard.updatedAt} head={head} title={data.dashboard.dashboard.title} user={data.dashboard.user} count={slots.length} owner={owner} dashboardKey={key}/>
  <div className={s.sync}><SyncChip write={write} version={version}/></div>
  {slots.length === 0 ? <EmptyDashboard owner={owner} dashboardKey={key}/> : <div className={s.grid}>
   {slots.map(slot => <SavedWidgetCard key={slot.id} id={slot.id} name={slot.name} size={slot.size}
    figure={numbers.get(slot.id)} subtitle={slot.widget ? importedFrom(slot.widget.user, data.dashboard!.user, auth.config!.wallet) : null} official={slot.widget?.official} status={slot.status} payload={slot.widget?.widget ?? null}
    version={version} head={head} expiresAt={slot.widget?.expiresAt} widgetKey={slot.widgetKey} owner={owner}/>)}
  </div>}
 </div>
}
