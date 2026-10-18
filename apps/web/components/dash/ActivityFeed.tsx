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
SELECT c.key,c.block,c.kind,COALESCE(t.value,p.value,'unlabelled') AS type
FROM changes c LEFT JOIN attributes t ON t.key=c.key AND t.name='type'
LEFT JOIN attributes p ON p.key=c.key AND p.name='project'
ORDER BY c.block DESC,c.key LIMIT 20`
export function ActivityFeed({version,head}:{version:number;head?:number}) {
 const q=useTimedQuery(ACTIVITY_SQL,version)
 return <section className="sec" id="activity" aria-labelledby="activity-h"><div className="sec-h"><h2 id="activity-h">Latest changes</h2><p>Current changes in the browser live overlay.</p></div><div className="feed">{q.error?<p className="error" style={{padding:16}}>{q.error}</p>:!q.data?.rows.length?<p className="empty" style={{padding:16}}>No rows yet</p>:<ul>{q.data.rows.map((r,i)=><li className="ev" key={String(r[0])+':'+i}><EventPill kind={String(r[2])}/><span className="ev-k hash" title={String(r[0])}>{shortHex(String(r[0]))}</span><span className="ev-t"><TypeTag value={String(r[3])}/></span><span className="ev-d">live overlay</span><span className="ev-b num">{Number(r[1]).toLocaleString()}</span><span className="ev-a num">{head===undefined?'…':blockAge(Number(r[1]),head)}</span></li>)}</ul>}</div></section>
}
