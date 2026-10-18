import { useTimedQuery } from '../../lib/use-query'
import { shortHex,blockAge } from '../../lib/format'
import { TypeTag } from './TypeTag'
import { EventPill } from './EventPill'
// Read the live overlay already maintained by IndexDb. No additional RPC poller.
export const ACTIVITY_SQL = `WITH previous AS (
 SELECT * EXCLUDE(rn) FROM (SELECT *, row_number() OVER (PARTITION BY key ORDER BY updated_at DESC) rn FROM (
 SELECT * FROM base_entities UNION ALL SELECT * FROM delta_entities)) WHERE rn=1
), changes AS (
 SELECT l.key,l.updated_at AS block, CASE WHEN l.created_at=l.updated_at THEN 'Created'
 WHEN p.owner IS NOT NULL AND l.owner<>p.owner THEN 'Transferred'
 WHEN p.expires_at IS NOT NULL AND l.expires_at>p.expires_at THEN 'Extended' ELSE 'Patched' END AS kind
 FROM live_entities l LEFT JOIN previous p ON p.key=l.key
 UNION ALL SELECT key,block,'Deleted' FROM live_tombstones
)
SELECT c.key,c.block,c.kind,COALESCE(t.value,p.value,CASE WHEN e.attrs_pending THEN 'pending' ELSE 'unlabelled' END) AS type
FROM changes c LEFT JOIN entities e ON e.key=c.key LEFT JOIN attributes t ON t.key=c.key AND t.name='type'
LEFT JOIN attributes p ON p.key=c.key AND p.name='project'
ORDER BY c.block DESC,c.key LIMIT 12`
export function ActivityFeed({version,head,limit=12,title='Latest changes',description='Current changes in the browser live overlay.'}:{version:number;head?:number;limit?:number;title?:string;description?:string}) {
 const q=useTimedQuery(ACTIVITY_SQL,version)
 const rows=q.data?.rows.slice(0,limit)??[]
 return <section className="sec" id="activity" aria-labelledby="activity-h"><div className="sec-h"><h2 id="activity-h">{title}</h2><p>{description}</p></div><div className="feed">{q.error?<p className="error feed-msg">{q.error}</p>:!rows.length?<p className="empty feed-msg">{q.loading?'Loading…':'No changes yet'}</p>:<ul>{rows.map((r,i)=><li className="ev" key={String(r[0])+':'+i}><EventPill kind={String(r[2])}/><span className="ev-k hash" title={String(r[0])}>{shortHex(String(r[0]))}</span><span className="ev-t" title={String(r[3])}><TypeTag value={String(r[3])}/></span><span className="ev-d"/><span className="ev-b num">{Number(r[1]).toLocaleString()}</span><span className="ev-a num">{head===undefined?'…':blockAge(Number(r[1]),head)}</span></li>)}</ul>}</div></section>
}
