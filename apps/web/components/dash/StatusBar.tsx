'use client'
import type { IndexState } from '../../lib/indexdb'
import { describeHeights, heightText, OLDEST_LABEL, OLDEST_SQL } from '../../lib/heights'
import { compact } from '../../lib/format'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { StateChip } from './StateChip'

type BarState = IndexState & { source?: 'indexer' | 'disk' }

export function indexStatus(state: BarState, oldest?: number) {
 const h = describeHeights({oldest,chain:state.liveHead,stored:state.deltaTo??state.manifest?.headBlock,snapshot:state.manifest?.snapshotBlock,serving:state.liveTail?.block,source:state.source})
 const status = state.source==='disk' ? 'disk' : state.status==='error' ? 'stale' : h.state
 return { h, status, label: state.source==='disk' ? 'served from disk' : undefined }
}

const NOTE: Record<string,string> = { chain:'Tiramisu RPC', serving:'Browser live tail', stored:'Stored delta' }
const EXPR_MAX = 32

export function StatusBarView({state,oldest}:{state:BarState;oldest?:number}) {
 const {h,status,label} = indexStatus(state,oldest)
 const m = state.manifest
 const expr = m?.expression || ''
 const exprText = !expr ? 'all entities' : expr.length>EXPR_MAX ? expr.slice(0,EXPR_MAX-1)+'…' : expr
 return <div className="sbar" role="region" aria-label="Index status"><div className="sbar-in">
  <div className="hts sbar-hts">
   <button type="button" className="sbar-btn" aria-describedby="height-details">
    <StateChip state={status} label={label}/>
    <span className="sbar-it sbar-chain">Tiramisu <span className="mono">{m?.chainId ?? '…'}</span></span>
    {h.items.map(i=><span key={i.label} className={'sbar-it sbar-h sbar-h-'+(i.label===OLDEST_LABEL?'from':i.label)}><span className="sbar-k">{i.label}</span> <span className="mono">{heightText(i)}</span></span>)}
    {h.lagText&&<span className="sbar-it sbar-lag">{h.lagText}</span>}
   </button>
   <div className="hts-pop" id="height-details" role="tooltip"><h4>Index freshness</h4><p className="sub">Rows past their expiry block are already gone.</p><dl className="hrows">{h.items.map(i=><div key={i.label} style={{display:'contents'}}><dt>{i.label}</dt><dd>{heightText(i)}</dd><dd className="m">{i.label===OLDEST_LABEL?(i.block===0?'Every live entity has its attributes':'Every live entity is indexed. Entities changed before this block are still loading attributes, newest first'):NOTE[i.label]}</dd></div>)}</dl><p>{h.lagText??'Waiting for chain and index heights'}</p>{state.error&&<p className="error">{state.error}</p>}{state.liveTail&&<p className="sub">{state.liveTail.pending.toLocaleString('en-US')} pending attribute fetches · RPC budget {state.liveTail.budget}</p>}<div className="hts-sec">Indexed expression<code className="expr-full">{expr||'all entities'}</code></div></div>
  </div>
  <span className="sbar-sp"/>
  {m?.pending ? <span className="sbar-it sbar-opt" title={`${m.pending.toLocaleString('en-US')} entities still waiting for attributes`}>attributes {compact(m.pending)} pending</span> : null}
  {m&&<span className="sbar-it sbar-opt">snapshot <span className="mono">v{m.version}</span></span>}
  <span className="sbar-it sbar-opt sbar-expr mono" title={expr||'all entities'}>{exprText}</span>
 </div></div>
}

export function StatusBar({state}:{state:BarState}) {
 const {version} = useIndex()
 const q = useTimedQuery(OLDEST_SQL,version)
 const raw = q.data?.rows[0]?.[0]
 return <StatusBarView state={state} oldest={raw===undefined||raw===null?undefined:Number(raw)}/>
}

export function TopStateChip({state}:{state:BarState}) {
 const {status,label} = indexStatus(state)
 return <span className="top-state" title="Index status, details in the status bar below"><StateChip state={status} label={label}/></span>
}
