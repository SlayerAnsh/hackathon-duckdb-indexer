import type { Widget } from '../../lib/views'
import { useTimedQuery } from '../../lib/use-query'
import { compact } from '../../lib/format'
import { RunBadge } from './RunBadge'
import { SqlBlock } from './SqlBlock'
import { NotInArkivQueryBadge } from './NotInArkivQueryBadge'
export function StatTile({widget,version}:{widget:Widget;version:number}) {
 const q=useTimedQuery(widget.sql,version);const value=q.data?.rows[0]?.[0]
 return <article className="tile" aria-busy={q.loading}><div className="tile-top"><span className="tile-l">{widget.title}</span></div><div className="tile-v">{value===null?'—':value===undefined?'…':compact(Number(value))}</div><RunBadge ms={q.ms} rows={q.data?.rows.length}/>{q.error&&<p className="error">{q.error}</p>}<div className="tile-s"><details><summary>View SQL</summary><NotInArkivQueryBadge reason={widget.notInArkivQuery}/><SqlBlock sql={widget.sql}/></details></div></article>
}
