'use client'
import { ARKIV_CHAIN } from '../../lib/chain'
import type { IndexState } from '../../lib/indexdb'
import { describeHeights, heightText, OLDEST_LABEL, OLDEST_SQL } from '../../lib/heights'
import { compact } from '../../lib/format'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { StateChip } from './StateChip'
import c from './chrome.module.css'
import { cx } from './cx'

type BarState = IndexState & { source?: 'indexer' | 'disk' }

export function indexStatus(state: BarState, oldest?: number) {
 const h = describeHeights({oldest,chain:state.liveHead,stored:state.deltaTo??state.manifest?.headBlock,snapshot:state.manifest?.snapshotBlock,serving:state.liveTail?.block,source:state.source})
 const status = state.source==='disk' ? 'disk' : state.status==='error' ? 'stale' : state.status==='loading' && h.state==='unknown' ? 'loading' : h.state
 return { h, status, label: state.source==='disk' ? 'served from disk' : undefined }
}

const NOTE: Record<string,string> = { chain:`${ARKIV_CHAIN.name} RPC`, serving:'Browser live tail', stored:'Stored delta' }
const EXPR_MAX = 32

export function StatusBarView({state,oldest}:{state:BarState;oldest?:number}) {
 const {h,status,label} = indexStatus(state,oldest)
 const m = state.manifest
 const expr = m?.expression || ''
 const exprText = !expr ? 'all entities' : expr.length>EXPR_MAX ? expr.slice(0,EXPR_MAX-1)+'…' : expr
 const cls: Record<string, string> = { [OLDEST_LABEL]: c.hFrom, stored: c.hStored, serving: c.hServing }
 return <div className={cx('sbar', c.bar)} role="region" aria-label="Index status"><div className={c.in}>
  <div className={c.hts}>
   <button type="button" className={c.btn} aria-describedby="height-details">
    <StateChip state={status} label={label}/>
    <span className={cx(c.it, c.chain)}><span className={c.k}>{ARKIV_CHAIN.name}</span> <span className={c.v}>{m?.chainId ?? '…'}</span></span>
    {h.items.map(i=><span key={i.label} className={cx(c.it, cls[i.label] ?? '')}><span className={c.k}>{i.label}</span> <span className={c.v}>{heightText(i)}</span></span>)}
    {h.lagText&&<span className={cx(c.it, c.lag)}>{h.lagText}</span>}
   </button>
   <div className={c.pop} id="height-details" role="tooltip"><h4>Index freshness</h4><p className={c.popSub}>Rows past their expiry block are already gone.</p><dl className={c.rows}>{h.items.map(i=><div key={i.label} style={{display:'contents'}}><dt>{i.label}</dt><dd>{heightText(i)}</dd><dd className={c.note}>{i.label===OLDEST_LABEL?(i.block===0?'Every live entity has its attributes':'Every live entity is indexed. Entities changed before this block are still loading attributes, newest first'):NOTE[i.label]}</dd></div>)}</dl><p className={c.lagLine}>{h.lagText??'Waiting for chain and index heights'}</p>{state.error&&<p className={c.popError}>{state.error}</p>}{state.liveTail&&<p className={c.popSub}>{state.liveTail.pending.toLocaleString('en-US')} pending attribute fetches · RPC budget {state.liveTail.budget}</p>}<div className={c.sec}>Indexed expression<code className={c.exprFull}>{expr||'all entities'}</code></div></div>
  </div>
  <span className={c.sp}/>
  <div className={c.right}>
   {m?.pending ? <span className={cx(c.it, c.opt)} title={`${m.pending.toLocaleString('en-US')} entities still waiting for attributes`}>attributes {compact(m.pending)} pending</span> : null}
   {m&&<span className={cx(c.it, c.opt)}><span className={c.k}>snapshot</span> <span className={c.v}>v{m.version}</span></span>}
   <span className={cx(c.it, c.opt, c.expr)} title={expr||'all entities'}>{exprText}</span>
  </div>
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
 return <span className={cx('top-state', c.topState)} title="Index status, details in the status bar below"><StateChip state={status} label={label}/></span>
}
