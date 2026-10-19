'use client'
import { useReducer, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import { tabFromSearch, searchForTab, tabAfterKey, type ExploreTab } from '../../lib/dash/explore-tabs'
import { dashboardCountSql, widgetCountSql } from '../../lib/dash/sql'
import { explorerReducer, initExplorer } from '../../lib/dash/explorer-state'
import { useDashAuth } from '../auth/DashAuthProvider'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { TopBar } from '../dash/TopBar'
import { Footer } from '../dash/Footer'
import { ExplorerGrid } from '../widgets/ExplorerGrid'
import { DashboardBrowse } from './DashboardBrowse'
import s from './explore.module.css'
export function ExplorePageView({tab,onTab,dashboards,widgets,children}:{tab:ExploreTab;onTab(tab:ExploreTab):void;dashboards?:number;widgets?:number;children?:ReactNode}) {
 return <><header className={s.header}><h1>Explore</h1><p>Every dashboard and widget is public and stored on Arkiv. Open one to see its live data and SQL.</p></header>
  <div role="tablist" aria-label="Explore" className={`tabs ${s.tabs}`}>{(['dashboards','widgets'] as const).map(value=><button key={value} id={`explore-tab-${value}`} className="tab" type="button" role="tab" aria-controls={`explore-panel-${value}`} aria-selected={tab===value} tabIndex={tab===value?0:-1} onClick={()=>onTab(value)} onKeyDown={e=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) return
   e.preventDefault(); const next=tabAfterKey(value,e.key);onTab(next)
   document.getElementById(`explore-tab-${next}`)?.focus()
  }}>{value==='dashboards'?'Dashboards':'Widgets'} <span className="tab-n">{(value==='dashboards'?dashboards:widgets) ?? '…'}</span></button>)}</div>
  {(['dashboards','widgets'] as const).map(value=><div key={value} id={`explore-panel-${value}`} role="tabpanel" aria-labelledby={`explore-tab-${value}`} hidden={tab!==value}>{tab===value && children}</div>)}
 </>
}
export function ExplorePage() {
 const params=useSearchParams(), tab=tabFromSearch(params.toString())
 const {config}=useDashAuth(), {version}=useIndex()
 const [explorer,dispatch]=useReducer(explorerReducer,undefined,initExplorer)
 const dashboards=useTimedQuery(config?.enabled?dashboardCountSql(config.wallet,{search:'',official:false}):'',version,{skip:!config?.enabled})
 const widgets=useTimedQuery(config?.enabled?widgetCountSql(config.wallet,{search:'',chart:null,user:null}):'',version,{skip:!config?.enabled})
 const onTab=(next:ExploreTab)=>window.history.replaceState(null,'',window.location.pathname+searchForTab(window.location.search,next)+window.location.hash)
 return <><TopBar/><main id="main" className="wrap"><ExplorePageView tab={tab} onTab={onTab} dashboards={dashboards.data?Number(dashboards.data.rows[0]?.[0]??0):undefined} widgets={widgets.data?Number(widgets.data.rows[0]?.[0]??0):undefined}>
  {tab==='dashboards'?<DashboardBrowse onWidgets={()=>onTab('widgets')}/>:<ExplorerGrid state={explorer} dispatch={dispatch}/>}
 </ExplorePageView></main><Footer/></>
}
