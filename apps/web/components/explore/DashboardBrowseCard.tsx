import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { DashboardListItem } from '../../lib/dash/sql'
import { shortHex } from '../../lib/format'
import { ChartIcon } from '../widgets/ChartIcon'
import { TimeLeft } from '../widgets/TimeLeft'
import { KeptLive, OfficialAuthor } from './Chips'
import s from './explore.module.css'
/** Renders from the indexer SQL row at once. `description` is undefined while the payload read is pending (one line skeleton) and null when it failed or is blank. */
export function DashboardBrowseCard({ item, head, description }: { item: DashboardListItem; head?: number; description?: string | null }) {
 const charts = item.charts.slice(0, 8)
 return <article className={`${s.card} ${s.dash}`}>
  <div className={s.thumb} style={{ '--cols': Math.min(Math.max(charts.length, 1), 4) } as CSSProperties} aria-hidden="true">
   {charts.length ? charts.map((chart, i) => <span key={chart + i}><ChartIcon type={chart} size={20}/></span>) : <span className={s.thumbEmpty}>No widgets yet</span>}
  </div>
  <div className={s.body}>
   <h3><Link className={s.stretch} href={'/d/' + item.key}>{item.title}</Link></h3>
   <div className={s.byline}>{item.official ? <OfficialAuthor/> : <span>by <span className={s.mono} title={item.user}>{shortHex(item.user)}</span></span>}</div>
   {description === undefined ? <span className="skel-text" data-skeleton="true" aria-hidden="true"/> : description ? <p className={s.description}>{description}</p> : null}
   <footer className={s.meta}><span>{item.widgets} {item.widgets === 1 ? 'widget' : 'widgets'}</span>{item.official ? <KeptLive/> : <TimeLeft expiresAt={item.expiresAt} head={head}/>}</footer>
  </div>
 </article>
}
