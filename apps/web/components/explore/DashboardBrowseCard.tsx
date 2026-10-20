'use client'
import { DashboardCover } from './DashboardCover'
import type { WidgetEntity } from '../../lib/dash/entities'
import type { TimedResult } from '../../lib/use-query'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { DashboardListItem } from '../../lib/dash/sql'
import { shortHex } from '../../lib/format'
import { TimeLeft } from '../widgets/TimeLeft'
import { KeptLive, OfficialAuthor } from './Chips'
import s from './explore.module.css'
/** Renders from the indexer SQL row at once. `description` is undefined while the payload read is pending (one line skeleton) and null when it failed or is blank.
 `facts` and `lifetime` replace the footer's widget count and expiry; `children` sits above the footer (the /me Syncing note). */
export function DashboardBrowseCard({ item, head, description, coverPayload, visibleOverride, query, facts, lifetime, children }: { item: DashboardListItem; head?: number; description?: string | null; coverPayload?: WidgetEntity | null; visibleOverride?: boolean; query?: TimedResult; facts?: ReactNode; lifetime?: ReactNode; children?: ReactNode }) {
 const charts = item.charts.slice(0, 4)
 return <article className={`${s.card} ${s.dash}`}>
  <DashboardCover cover={item.cover} charts={charts} payload={coverPayload} visibleOverride={visibleOverride} query={query}/>
  <div className={s.body}>
   <h3><Link className={s.stretch} href={'/d/' + item.key}>{item.title}</Link></h3>
   <div className={s.byline}>{item.official ? <OfficialAuthor address={<span className={s.mono} title={item.user}>{shortHex(item.user)}</span>}/> : <span>by <span className={s.mono} title={item.user}>{shortHex(item.user)}</span></span>}</div>
   {description === undefined ? <span className="skel-text" data-skeleton="true" aria-hidden="true"/> : description ? <p className={s.description}>{description}</p> : null}
   {children}
   <footer className={s.meta}><span>{facts ?? <>{item.widgets} {item.widgets === 1 ? 'widget' : 'widgets'}</>}</span>{lifetime !== undefined ? lifetime : item.official ? <KeptLive/> : <TimeLeft expiresAt={item.expiresAt} head={head}/>}</footer>
  </div>
 </article>
}
