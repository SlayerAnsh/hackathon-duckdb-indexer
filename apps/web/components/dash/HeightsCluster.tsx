import type { IndexState } from '../../lib/indexdb'
import { describeHeights, heightText, OLDEST_SQL } from '../../lib/heights'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { StateChip } from './StateChip'
export function HeightsCluster({state}:{state:IndexState & {source?:'indexer'|'disk'}}) {
 const {version}=useIndex()
 const q=useTimedQuery(OLDEST_SQL,version)
 const raw=q.data?.rows[0]?.[0]
 const oldest=raw===undefined||raw===null?undefined:Number(raw)
 const h=describeHeights({oldest,chain:state.liveHead,stored:state.deltaTo??state.manifest?.headBlock,snapshot:state.manifest?.snapshotBlock,serving:state.liveTail?.block,source:state.source})
 const status=state.status==='error'?'stale':h.state
 return <div className="hts"><button className="hts-btn" aria-describedby="height-details"><StateChip state={state.source==='disk'?'disk':status} label={state.source==='disk'?'served from disk':undefined}/><span className="hts-h">{h.items.map(i=>`${i.label} ${heightText(i)}`).join(' · ')}</span><span className="hts-lag">{h.lagText}</span></button><div className="hts-pop" id="height-details" role="tooltip"><h4>Index freshness</h4><p className="sub">Rows past their expiry block are already gone.</p><dl className="hrows">{h.items.map(i=><div key={i.label} style={{display:'contents'}}><dt>{i.label}</dt><dd>{heightText(i)}</dd><dd className="m">{i.label==='from'?(i.block===0?'Attributes complete from genesis':'Attributes complete from here; older entities still loading'):i.label==='chain'?'Tiramisu RPC':i.label==='serving'?'Browser live tail':'Stored delta'}</dd></div>)}</dl><p>{h.lagText??'Waiting for chain and index heights'}</p>{state.error&&<p className="error">{state.error}</p>}{state.liveTail&&<p className="sub">{state.liveTail.pending} pending attribute fetches · RPC budget {state.liveTail.budget}</p>}<div className="hts-sec">Indexed expression<code className="expr-full">{state.manifest?.expression||'all entities'}</code></div></div></div>
}
