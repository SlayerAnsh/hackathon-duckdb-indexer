'use client'
import Link from 'next/link'
import { useCoverPayloads } from '../../lib/dash/use-cover-payloads'
import { useEffect, useReducer, useState } from 'react'
import { useDashAuth } from '../auth/DashAuthProvider'
import { dashboardBrowseQuery, dashboardBrowseReducer, initDashboardBrowse, resultsLine, type DashboardBrowseState } from '../../lib/dash/dashboard-browse-state'
import { dashboardCountSql, dashboardListSql, toDashboardItems, type DashboardListItem, type DashboardListQuery } from '../../lib/dash/sql'
import { useDashboardEntities, entityRev } from '../../lib/dash/entity-cache'
import { useIndex } from '../../lib/use-index'
import { useNavigate } from '../../lib/use-navigate'
import { useTimedQuery } from '../../lib/use-query'
import { showLoading } from '../../lib/dash/loading'
import { useDebounced } from '../../lib/dash/use-debounced'
import { DashboardBrowseCard } from './DashboardBrowseCard'
import { EmptyState, PlusIcon, SkeletonCards } from '../widgets/EmptyState'
import { LoginIcon } from '../widgets/AccountButton'
import { CountLine, PrimaryLabel, SearchField, ToggleChip, Toolbar, ToolbarSelect } from './Toolbar'
import s from './explore.module.css'
export const NEW_DASHBOARD_HREF = '/me?new=dashboard'
/** Starts login first when needed, then opens the new dashboard dialog on /me. */
export function goNewDashboard(auth: ReturnType<typeof useDashAuth>, event: React.MouseEvent, navigate: (href: string) => void = href => window.location.assign(href)) {
 if (auth.status === 'authenticated') return
 event.preventDefault()
 void auth.requestLogin().then(ok => { if (ok) navigate(NEW_DASHBOARD_HREF) }).catch(() => {})
}
export function DashboardBrowseView({ state, dispatch, items, total, loading, error, head, descriptions, onWidgets, children }: {
 state: DashboardBrowseState; dispatch(a: Parameters<typeof dashboardBrowseReducer>[1]): void; items: DashboardListItem[]; total: number | null; loading: boolean; error?: string; head?: number; descriptions?: Map<string,string>; onWidgets?(): void; children?: React.ReactNode
}) {
 const auth = useDashAuth()
 const navigate = useNavigate()
 const [search,setSearch] = useState(state.search)
 const debounced = useDebounced(search)
 useEffect(()=>{setSearch(state.search)},[state.search])
 useEffect(()=>{if(debounced !== state.search) dispatch({type:'search',value:debounced})},[debounced,state.search,dispatch])
 const filtered = !!state.search || state.official
 const loggedIn = auth.status === 'authenticated'
 const empty = !loading && !error && total === 0
 return <section className={s.browse}>
  <Toolbar count={total ? <CountLine text={resultsLine(total,state)}/> : null}>
   <SearchField label="Search dashboards by title or creator 0x…" value={search} onChange={setSearch}/>
   <ToolbarSelect aria-label="Sort dashboards" value={state.sort} onChange={e=>dispatch({type:'sort',value:e.target.value as DashboardBrowseState['sort']})}><option value="newest">Newest</option><option value="widgets">Most widgets</option><option value="expiring">Expiring soon</option></ToolbarSelect>
   <ToggleChip label="Featured only" checked={state.official} onChange={value=>dispatch({type:'official',value})}/>
   <Link className={`btn btn-primary ${s.primary}`} href={NEW_DASHBOARD_HREF} onClick={e=>goNewDashboard(auth,e,navigate)}><PlusIcon/><PrimaryLabel>New dashboard</PrimaryLabel></Link>
  </Toolbar>
  {error && <p role="alert" className="error">{error}</p>}
  {empty ? filtered
   ? <EmptyState icon="search" title="No matches" body={state.search ? `Nothing matches “${state.search}”.` : 'Nothing matches these filters.'} actions={<button type="button" className="btn btn-outline" onClick={()=>{setSearch('');dispatch({type:'clear'})}}>Clear filters</button>}/>
   : <EmptyState icon="dashboard" title="No dashboards yet" body="Dashboards are public pages of live charts stored on Arkiv. Create one from your widgets or start from a featured dashboard." actions={<>
     {loggedIn ? <Link className="btn btn-primary" href={NEW_DASHBOARD_HREF}><PlusIcon/>New dashboard</Link> : <button type="button" className="btn btn-primary" onClick={()=>void auth.requestLogin().then(ok=>{if(ok) navigate(NEW_DASHBOARD_HREF)}).catch(()=>{})}><LoginIcon/>Log in to create</button>}
     {onWidgets ? <button type="button" className="btn btn-quiet" onClick={onWidgets}>Browse widgets</button> : <Link className="btn btn-quiet" href="/explore?tab=widgets">Browse widgets</Link>}
    </>}/>
  : <div className={s.grid} aria-busy={loading}>{loading && !children ? <SkeletonCards count={6} label="Loading dashboards…"/> : <>{items.map(item=><DashboardBrowseCard key={item.key} item={item} head={head} description={descriptions ? descriptions.get(item.key) ?? null : undefined}/>)}{children}</>}</div>}
  {total !== null && state.pages * 12 < total && <button type="button" className={`btn btn-outline ${s.more}`} onClick={()=>dispatch({type:'more'})}>Load 12 more</button>}
 </section>
}
function DashboardResultsPage({ q, version, head }: { q: DashboardListQuery; version: number; head?: number }) {
 const {config} = useDashAuth()
 const list = useTimedQuery(config?.enabled ? dashboardListSql(config.wallet,q) : '',version,{skip:!config?.enabled})
 const items = toDashboardItems(list.data?.rows ?? [])
 const covers = useCoverPayloads(items)
 const entities = useDashboardEntities((items ?? []).map(item => item.key), new Map((items ?? []).map(item => [item.key, entityRev(item)])))
 const descriptions = entities.data ? new Map([...entities.data].flatMap(([key,value]) => value ? [[key,value.dashboard.description] as const] : [])) : undefined

 return <>{items.map(item=><DashboardBrowseCard key={item.key} item={item} head={head} coverPayload={covers ? covers.get(item.cover ?? "") ?? null : undefined} description={descriptions ? descriptions.get(item.key) ?? null : undefined}/>)}
  {showLoading({loading:list.loading,data:list.data}) && <SkeletonCards count={3} label="Loading dashboards…"/>}{list.error && <p role="alert" className="error">{list.error}</p>}</>
}
export function DashboardBrowse({ onWidgets }: { onWidgets?(): void } = {}) {
 const {config}=useDashAuth(), {state:index,version}=useIndex()
 const [state,dispatch]=useReducer(dashboardBrowseReducer,undefined,initDashboardBrowse)
 const q=dashboardBrowseQuery(state)
 const count=useTimedQuery(config?.enabled ? dashboardCountSql(config.wallet,q) : '',version,{skip:!config?.enabled})
 if(!config) return <section className={s.browse}><div className={s.grid}><SkeletonCards count={3} label="Loading dashboards…"/></div></section>
 if(!config.enabled) return <p className={`notice notice-info ${s.disabled}`}>Dashboards are not enabled on this deployment.</p>
 const scope=JSON.stringify([q.search,q.sort,q.official])
 return <DashboardBrowseView state={state} dispatch={dispatch} items={[]} total={count.data ? Number(count.data.rows[0]?.[0] ?? 0) : null} loading={showLoading({loading:count.loading,data:count.data})} error={count.error} onWidgets={onWidgets}>
  {Array.from({length:state.pages},(_,page)=><DashboardResultsPage key={`${scope}:${page}`} q={{...q,limit:12,offset:page*12}} version={version} head={index.liveHead}/>)}
 </DashboardBrowseView>
}
