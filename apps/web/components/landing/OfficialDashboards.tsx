'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useDashAuth } from '../auth/DashAuthProvider'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { dashboardListSql, toDashboardItems, type DashboardListItem } from '../../lib/dash/sql'
import { fetchDashboards } from '../../lib/dash/read'
import { createBrowserRpc } from '../../lib/rpc-browser'
import { DashboardBrowseCard } from '../explore/DashboardBrowseCard'
import { EmptyState, SkeletonCards } from '../widgets/EmptyState'
import s from './landing.module.css'

export function OfficialDashboardsView({ enabled, items, descriptions, head, error }: { enabled: boolean; items: DashboardListItem[] | null; descriptions?: Map<string, string>; head?: number; error?: string }) {
 if (!enabled) return null
 return <section className={s.section} aria-labelledby="official-h">
  <div className={s.sectionHead}>
   <div><h2 id="official-h">Official dashboards</h2><p>Live network reports kept on Arkiv by this app. Open one to see every chart and its SQL.</p></div>
   <Link className={s.headLink} href="/explore">All dashboards <span aria-hidden="true">→</span></Link>
  </div>
  <div className={s.officialGrid} aria-busy={items === null && !error}>
   {error ? <p role="alert" className="notice notice-bad">{error}</p> : null}
   {items === null
    ? !error && <SkeletonCards count={3} label="Loading official dashboards…"/>
    : items.length === 0
     ? !error && <EmptyState compact icon="official" title="Official reports are on their way" body="Network reports kept live by this app will appear here. Until then, browse what the community built." actions={<Link className="btn btn-sm" href="/explore">Browse community dashboards</Link>}/>
     : items.map(item => <DashboardBrowseCard key={item.key} item={item} head={head} description={descriptions ? descriptions.get(item.key) ?? null : undefined}/>)}
  </div>
 </section>
}

export function OfficialDashboards() {
 const { config } = useDashAuth()
 const { state, version } = useIndex()
 const enabled = !!config?.enabled
 const query = useTimedQuery(enabled ? dashboardListSql(config!.wallet, { search: '', sort: 'oldest', official: true, limit: 6, offset: 0 }) : '', version, { skip: !enabled })
 const items = query.data ? toDashboardItems(query.data.rows) : null
 const keys = items?.map(item => item.key).join(',') ?? ''
 const scope = `${config?.wallet}:${config?.rpcUrl}:${keys}`
 const [record, setRecord] = useState<{ scope: string; descriptions: Map<string, string> } | null>(null)
 useEffect(() => {
  if (!config?.enabled || !keys) return
  let active = true
  void fetchDashboards(createBrowserRpc(config.rpcUrl), config.wallet, keys.split(',')).then(({ dashboards }) => {
   if (active) setRecord({ scope, descriptions: new Map([...dashboards].map(([key, value]) => [key, value.dashboard.description])) })
  }).catch(() => { if (active) setRecord({ scope, descriptions: new Map() }) })
  return () => { active = false }
 }, [config?.enabled, config?.wallet, config?.rpcUrl, keys, scope])
 return <OfficialDashboardsView enabled={enabled} items={items} head={state.liveHead} error={query.error} descriptions={record?.scope === scope ? record.descriptions : undefined}/>
}
