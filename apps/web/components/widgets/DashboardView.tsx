'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useDashAuth } from '../auth/DashAuthProvider'
import { AddressLink } from '../dash/AddressLink'
import { useDashboard } from '../../lib/dash/use-dashboard'
import { dashboardSlots } from '../../lib/dash/slots'
import { usePending } from '../../lib/dash/pending'
import { useIndex } from '../../lib/use-index'
import { SavedWidgetCard } from './SavedWidgetCard'
import { SyncChip } from './SyncChip'
import s from '../showcase/showcase.module.css'

export function DashboardHeader({ title, user, count, owner, dashboardKey }: { title: string; user: string; count: number; owner: boolean; dashboardKey: string }) {
 const [copied, setCopied] = useState(false)
 async function copyLink() {
  try {
   await navigator.clipboard.writeText(location.origin + '/d/' + dashboardKey)
   setCopied(true)
   setTimeout(() => setCopied(false), 2000)
  } catch { setCopied(false) }
 }
 return <header className={s.intro}>
  <div><h1>{title}</h1><p>by <AddressLink address={user}/> · {count} {count === 1 ? 'widget' : 'widgets'}</p></div>
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
   {owner && <><Link className="btn" href={'/d/' + dashboardKey + '/edit'}>Organize</Link><Link className="btn btn-primary" href={'/d/' + dashboardKey + '/edit?import=1'}>+ Add widget</Link></>}
   <button type="button" className="btn btn-quiet" aria-live="polite" onClick={() => void copyLink()}>{copied ? '✓ Link copied' : 'Copy link'}</button>
  </div>
 </header>
}

export function EmptyDashboard({ owner, dashboardKey }: { owner: boolean; dashboardKey: string }) {
 return <section><p>{owner ? 'This dashboard is empty.' : 'This dashboard has no widgets yet.'}</p>{owner && <Link className="btn btn-primary" href={'/d/' + dashboardKey + '/edit?import=1'}>+ Add widget</Link>}</section>
}
export function MissingDashboard() {
 return <section><p>Dashboard not found. It may have expired or the link is wrong.</p><Link href="/widgets">Browse widgets</Link></section>
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
 const owner = data.dashboard.user === auth.address
 const slots = dashboardSlots(data.links, data.widgets)
 return <div className={s.page}>
  <DashboardHeader title={data.dashboard.dashboard.title} user={data.dashboard.user} count={slots.length} owner={owner} dashboardKey={key}/>
  <SyncChip write={write} version={version}/>
  {slots.length === 0 ? <EmptyDashboard owner={owner} dashboardKey={key}/> : <div className={s.grid}>
   {slots.map(slot => <SavedWidgetCard key={slot.id} id={slot.id} name={slot.name} size={slot.size}
    status={slot.widget && slot.widget.expiresAt <= head ? 'expired' : slot.status} payload={slot.widget?.widget ?? null}
    version={version} head={head} expiresAt={slot.widget?.expiresAt} widgetKey={slot.widgetKey} owner={owner}/>)}
  </div>}
 </div>
}
