import { useTimedQuery } from '../../lib/use-query'
import { shortHex,blockAge } from '../../lib/format'
import { TypeTag } from './TypeTag'
import { EventPill } from './EventPill'
import c from './chrome.module.css'
import { cx } from './cx'
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
 return <section className="sec" id="activity" aria-labelledby="activity-h"><div className="sec-h"><h2 id="activity-h">{title}</h2><p>{description}</p></div><div className={cx('feed', c.feed)}>{q.error?<p className={c.feedError} role="alert">{q.error}</p>:!rows.length?(q.loading?<ul aria-busy="true">{[0,1,2].map(i=><li key={i} className={cx('ev', c.ev)} aria-hidden="true"><span className={cx('skel', c.skelRow)} style={{width:72}}/><span className={cx('skel', c.skelRow)} style={{width:96}}/><span className={cx('skel', c.skelRow)} style={{width:'40%'}}/><span className={cx('skel', c.skelRow)} style={{width:56,justifySelf:'end'}}/><span className={cx('skel', c.skelRow)} style={{width:40,justifySelf:'end'}}/></li>)}<li className="sr-only" role="status">Loading…</li></ul>:<p className={c.feedMsg}>No changes yet. New creates, updates and deletions appear here as blocks arrive.</p>):<ul>{rows.map((r,i)=><li className={cx('ev', c.ev)} key={String(r[0])+':'+i}><EventPill kind={String(r[2])}/><span className={c.evKey} title={String(r[0])}>{shortHex(String(r[0]))}</span><span className={c.evType}><TypeTag value={String(r[3])}/></span><span className={c.evBlock} title="Block">{Number(r[1]).toLocaleString('en-US')}</span><span className={c.evAge}>{head===undefined?'…':blockAge(Number(r[1]),head)+' ago'}</span></li>)}</ul>}</div></section>
}
