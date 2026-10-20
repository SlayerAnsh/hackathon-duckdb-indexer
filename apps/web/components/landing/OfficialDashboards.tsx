'use client'
import Link from 'next/link'
import { useCoverPayloads } from '../../lib/dash/use-cover-payloads'
import type { WidgetEntity } from '../../lib/dash/entities'
import { useDashAuth } from '../auth/DashAuthProvider'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { dashboardListSql, toDashboardItems, type DashboardListItem } from '../../lib/dash/sql'
import { useDashboardEntities, entityRev } from '../../lib/dash/entity-cache'
import { DashboardBrowseCard } from '../explore/DashboardBrowseCard'
import { EmptyState, SkeletonCards } from '../widgets/EmptyState'
import s from './landing.module.css'

export function OfficialDashboardsView({ enabled, items, descriptions, covers, head, error }: { enabled: boolean; items: DashboardListItem[] | null; descriptions?: Map<string, string>; covers?: Map<string, WidgetEntity>; head?: number; error?: string }) {
 if (!enabled) return null
 return <section className={s.section} aria-labelledby="official-h">
  <div className={s.sectionHead}>
   <div><h2 id="official-h">Featured dashboards</h2><p>Live network reports kept on Arkiv by this app. Open one to see every chart and its SQL.</p></div>
   <Link className={s.headLink} href="/explore">All dashboards <span aria-hidden="true">→</span></Link>
  </div>
  <div className={s.officialGrid} aria-busy={items === null && !error}>
   {error ? <p role="alert" className="notice notice-bad">{error}</p> : null}
   {items === null
    ? !error && <SkeletonCards count={3} label="Loading featured dashboards…"/>
    : items.length === 0
     ? !error && <EmptyState compact icon="official" title="Featured dashboards are on their way" body="Network reports kept live by this app will appear here. Until then, browse what the community built." actions={<Link className="btn btn-sm" href="/explore">Browse community dashboards</Link>}/>
     : items.map(item => <DashboardBrowseCard key={item.key} item={item} head={head} coverPayload={covers ? covers.get(item.cover ?? "") ?? null : undefined} description={descriptions ? descriptions.get(item.key) ?? null : undefined}/>)}
  </div>
 </section>
}

export function OfficialDashboards() {
 const { config } = useDashAuth()
 const { state, version } = useIndex()
 const enabled = !!config?.enabled
 const query = useTimedQuery(enabled ? dashboardListSql(config!.wallet, { search: '', sort: 'oldest', official: true, limit: 6, offset: 0 }) : '', version, { skip: !enabled })
 const items = query.data ? toDashboardItems(query.data.rows) : null
 const covers = useCoverPayloads(items ?? [])
 const entities = useDashboardEntities((items ?? []).map(item => item.key), new Map((items ?? []).map(item => [item.key, entityRev(item)])))
 const descriptions = entities.data ? new Map([...entities.data].flatMap(([key,value]) => value ? [[key,value.dashboard.description] as const] : [])) : undefined

 return <OfficialDashboardsView enabled={enabled} items={items} covers={covers} head={state.liveHead} error={query.error} descriptions={descriptions}/>
}
