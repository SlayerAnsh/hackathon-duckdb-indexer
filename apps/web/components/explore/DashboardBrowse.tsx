'use client'
import { useEffect, useReducer, useState } from 'react'
import { useDashAuth } from '../auth/DashAuthProvider'
import { dashboardBrowseQuery, dashboardBrowseReducer, initDashboardBrowse, resultsLine, type DashboardBrowseState } from '../../lib/dash/dashboard-browse-state'
import { dashboardCountSql, dashboardListSql, toDashboardItems, type DashboardListItem, type DashboardListQuery } from '../../lib/dash/sql'
import { fetchDashboards } from '../../lib/dash/read'
import { createBrowserRpc } from '../../lib/rpc-browser'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { showLoading } from '../../lib/dash/loading'
import { useDebounced } from '../../lib/dash/use-debounced'
import { DashboardBrowseCard } from './DashboardBrowseCard'
import s from './explore.module.css'
export function DashboardBrowseView({ state, dispatch, items, total, loading, error, head, descriptions, children }: {
 state: DashboardBrowseState; dispatch(a: Parameters<typeof dashboardBrowseReducer>[1]): void; items: DashboardListItem[]; total: number | null; loading: boolean; error?: string; head?: number; descriptions?: Map<string,string>; children?: React.ReactNode
}) {
 const auth = useDashAuth()
 const [search,setSearch] = useState(state.search)
 const debounced = useDebounced(search)
 useEffect(()=>{setSearch(state.search)},[state.search])
 useEffect(()=>{if(debounced !== state.search) dispatch({type:'search',value:debounced})},[debounced,state.search,dispatch])
 const filtered = !!state.search || state.official
 return <section className={s.browse}>
  <div className={s.controls}><input aria-label="Search dashboards by title or creator 0x…" placeholder="Search dashboards by title or creator 0x…" value={search} onChange={e=>setSearch(e.target.value)}/>
   <select aria-label="Sort dashboards" value={state.sort} onChange={e=>dispatch({type:'sort',value:e.target.value as DashboardBrowseState['sort']})}><option value="newest">Newest</option><option value="widgets">Most widgets</option><option value="expiring">Expiring soon</option></select>
   <label><input type="checkbox" checked={state.official} onChange={e=>dispatch({type:'official',value:e.target.checked})}/> Official only</label>
  </div>
  {total !== null && <p className={s.results} role="status">{resultsLine(total,state)}</p>}
  {error && <p role="alert" className="error">{error}</p>}
  {loading && <p role="status">Loading the index into your browser…</p>}
  <div className={s.grid}>{items.map(item=><DashboardBrowseCard key={item.key} item={item} head={head} description={descriptions?.get(item.key)}/>)}{children}</div>
  {!loading && !error && total === 0 && <p>{filtered ? <>No dashboards match these filters. <button className="btn btn-quiet" onClick={()=>{setSearch('');dispatch({type:'clear'})}}>Clear filters</button></> : <>No dashboards yet. Build the first one. <a className="btn btn-outline" href="/me" onClick={e=>{if(auth.status !== 'authenticated'){e.preventDefault();void auth.requestLogin().then(ok=>{if(ok) window.location.assign('/me')}).catch(()=>{})}}}>Build your dashboard</a></>}</p>}
  {total !== null && state.pages * 12 < total && <button className="btn" onClick={()=>dispatch({type:'more'})}>Load 12 more</button>}
 </section>
}
function DashboardResultsPage({ q, version, head }: { q: DashboardListQuery; version: number; head?: number }) {
 const {config} = useDashAuth()
 const list = useTimedQuery(config?.enabled ? dashboardListSql(config.wallet,q) : '',version,{skip:!config?.enabled})
 const items = toDashboardItems(list.data?.rows ?? [])
 const keys = items.map(item=>item.key).join(',')
 const scope = `${config?.wallet}:${config?.rpcUrl}:${keys}`
 const [record,setRecord] = useState<{scope:string; descriptions:Map<string,string>} | null>(null)
 useEffect(()=>{
  if(!config?.enabled || !keys) return
  let active=true
  void fetchDashboards(createBrowserRpc(config.rpcUrl),config.wallet,keys.split(',')).then(result=>{
   if(active) setRecord({scope,descriptions:new Map([...result.dashboards].map(([key,value])=>[key,value.dashboard.description]))})
  }).catch(()=>{})
  return ()=>{active=false}
 },[config?.enabled,config?.wallet,config?.rpcUrl,keys,scope])
 return <>{items.map(item=><DashboardBrowseCard key={item.key} item={item} head={head} description={record?.scope === scope ? record.descriptions.get(item.key) : undefined}/>)}
  {showLoading({loading:list.loading,data:list.data}) && <p role="status">Loading the index into your browser…</p>}{list.error && <p role="alert" className="error">{list.error}</p>}</>
}
export function DashboardBrowse() {
 const {config}=useDashAuth(), {state:index,version}=useIndex()
 const [state,dispatch]=useReducer(dashboardBrowseReducer,undefined,initDashboardBrowse)
 const q=dashboardBrowseQuery(state)
 const count=useTimedQuery(config?.enabled ? dashboardCountSql(config.wallet,q) : '',version,{skip:!config?.enabled})
 if(!config) return <p>Loading the index into your browser…</p>
 if(!config.enabled) return <p>Dashboards are not enabled on this deployment.</p>
 const scope=JSON.stringify([q.search,q.sort,q.official])
 return <DashboardBrowseView state={state} dispatch={dispatch} items={[]} total={count.data ? Number(count.data.rows[0]?.[0] ?? 0) : null} loading={showLoading({loading:count.loading,data:count.data})} error={count.error}>
  {Array.from({length:state.pages},(_,page)=><DashboardResultsPage key={`${scope}:${page}`} q={{...q,limit:12,offset:page*12}} version={version} head={index.liveHead}/>)}
 </DashboardBrowseView>
}
