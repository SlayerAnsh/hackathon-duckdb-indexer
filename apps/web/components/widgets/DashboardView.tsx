'use client'
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
import { figureNumbers, importedFrom, updatedLabel } from '../../lib/dash/report'
import s from './report.module.css'

export function ReportHeader({ title, description, user, official, count, owner, dashboardKey, updatedAt, head }: {
 title: string; description: string; user: string; official: boolean; count: number; owner: boolean; dashboardKey: string; updatedAt: number; head: number
}) {
 return <header className={s.header}>
  <nav className={s.breadcrumb} aria-label="Breadcrumb"><Link href="/explore">Explore</Link><span>/</span><Link href="/explore?tab=dashboards">Dashboards</Link><span>/</span><span>{title}</span></nav>
  <div className={s.top}>
   <div className={s.eyebrow}>{official ? <><span className="chip chip-official"><span aria-hidden="true">⛨</span>Official</span><span>Network report</span></> : 'Dashboard'}</div>
   <div className={s.tools} role="toolbar" aria-label="Dashboard actions">
    {owner && !official && <><Link className="ib tip" data-tip="Organize" aria-label="Organize dashboard" href={'/d/' + dashboardKey + '/edit'}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m10 2 4 4-8 8H2v-4zM8 4l4 4"/></svg></Link><Link className="ib tip" data-tip="Add widgets" aria-label="Add widgets" href={'/d/' + dashboardKey + '/edit?import=1'}><svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 2v12M2 8h12"/></svg></Link></>}
    <ShareMenu title={title} dashboardKey={dashboardKey}/>
   </div>
  </div>
  <h1 className={s.title}>{title}</h1>
  {description.trim() && <p className={s.description}>{description}</p>}
  <div className={s.meta}><span>By {official ? 'Arkiv SQL Indexer' : <AddressLink address={user}/>}</span><span aria-hidden="true">·</span><span>{count} {count === 1 ? 'widget' : 'widgets'}</span><span aria-hidden="true">·</span><span><i className={s.pulse} aria-hidden="true"/>Live, computed in your browser</span><span aria-hidden="true">·</span><span>{updatedLabel(updatedAt, head)}</span></div>
 </header>
}

export function EmptyDashboard({ owner, dashboardKey }: { owner: boolean; dashboardKey: string }) {
 return <section><p>{owner ? 'This dashboard is empty.' : 'This dashboard has no widgets yet.'}</p>{owner && <Link className="btn btn-primary" href={'/d/' + dashboardKey + '/edit?import=1'}>+ Add widget</Link>}</section>
}
export function MissingDashboard() {
 return <section><p>Dashboard not found. It may have expired or the link is wrong.</p><Link href="/explore?tab=widgets">Browse widgets</Link></section>
}

export function DashboardView({ dashboardKey }: { dashboardKey: string }) {
 const key = dashboardKey.toLowerCase()
 const auth = useDashAuth()
 const data = useDashboard(key)
 const { state, version } = useIndex()
 const pending = usePending()
 const write = pending.find(entry => entry.key === key && entry.kind === 'dashboard')
 if (!auth.config) return <p>Loading the index into your browser…</p>
 if (!auth.config.enabled) return <p>Dashboards are not enabled on this deployment.</p>
 if (data.status === 'loading') return <p>Loading the index into your browser…</p>
 if (data.status === 'error') return <p className="error" role="status">{data.error}</p>
 const head = Math.max(data.head ?? 0, state.liveHead ?? 0)
 if (!data.dashboard || data.dashboard.expiresAt <= head) return <MissingDashboard/>
 const owner = !data.dashboard.official && data.dashboard.user === auth.address
 const slots = dashboardSlots(data.links, data.widgets).map(slot => ({
  ...slot, status: slot.widget && slot.widget.expiresAt <= head ? 'expired' as const : slot.status,
 }))
 const numbers = figureNumbers(slots.map(slot => ({ id: slot.id, status: slot.status, chart: slot.widget?.chart ?? null })))
 return <div className={s.page}>
  <ReportHeader description={data.dashboard.dashboard.description} official={data.dashboard.official} updatedAt={data.dashboard.updatedAt} head={head} title={data.dashboard.dashboard.title} user={data.dashboard.user} count={slots.length} owner={owner} dashboardKey={key}/>
  <SyncChip write={write} version={version}/>
  {slots.length === 0 ? <EmptyDashboard owner={owner} dashboardKey={key}/> : <div className={s.grid}>
   {slots.map(slot => <SavedWidgetCard key={slot.id} id={slot.id} name={slot.name} size={slot.size}
    figure={numbers.get(slot.id)} subtitle={slot.widget ? importedFrom(slot.widget.user, data.dashboard!.user, auth.config!.wallet) : null} official={slot.widget?.official} status={slot.status} payload={slot.widget?.widget ?? null}
    version={version} head={head} expiresAt={slot.widget?.expiresAt} widgetKey={slot.widgetKey} owner={owner}/>)}
  </div>}
 </div>
}
