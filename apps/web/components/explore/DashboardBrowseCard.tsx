import Link from 'next/link'
import type { DashboardListItem } from '../../lib/dash/sql'
import { shortHex } from '../../lib/format'
import { ChartIcon } from '../widgets/ChartIcon'
import { TimeLeft } from '../widgets/TimeLeft'
import s from './explore.module.css'
/** Renders from the indexer SQL row at once. `description` is undefined while the payload read is pending (one line skeleton) and null when it failed or is blank. */
export function DashboardBrowseCard({ item, head, description }: { item: DashboardListItem; head?: number; description?: string | null }) {
 return <article className={s.card}>
  <div className={s.thumb}>{item.charts.length ? item.charts.slice(0,8).map(chart => <span key={chart}><ChartIcon type={chart} size={24}/></span>) : <span>No widgets yet</span>}</div>
  <div className={s.body}><div className={s.byline}>{item.official ? <><span className="chip chip-official">⛨ Official</span> Arkiv SQL Indexer</> : shortHex(item.user)}</div>
   <h3><Link href={'/d/' + item.key}>{item.title}</Link></h3>{description === undefined ? <span className="skel-text" data-skeleton="true" aria-hidden="true"/> : description ? <p className={s.description}>{description}</p> : null}
   <footer className={s.meta}><span>{item.widgets} {item.widgets === 1 ? 'widget' : 'widgets'}</span>{item.official ? <span className="chip">◷ Kept live</span> : <TimeLeft expiresAt={item.expiresAt} head={head}/>}</footer>
  </div>
 </article>
}
