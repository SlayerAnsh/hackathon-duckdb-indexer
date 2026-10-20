'use client'
import { showLoading } from '../../lib/dash/loading'
import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import type { WidgetEntity } from '../../lib/dash/entities'
import type { WidgetListItem } from '../../lib/dash/use-widget-list'
import { useInView } from '../../lib/dash/use-in-view'
import { useWidgetQuery } from '../../lib/dash/use-widget-query'
import type { TimedResult } from '../../lib/use-query'
import { AddressLink } from '../dash/AddressLink'
import { CheckIcon, KeptLive, OfficialAuthor } from '../explore/Chips'
import { ChartIcon } from './ChartIcon'
import { CHART_LABELS } from './ChartPicker'
import { PlusIcon } from './EmptyState'
import { TimeLeft } from './TimeLeft'
import { WidgetPreview } from './WidgetPreview'
import s from '../explore/explore.module.css'

const stop = { onClick: (event: React.SyntheticEvent) => event.stopPropagation(), onKeyDown: (event: React.SyntheticEvent) => event.stopPropagation() }

/** Title, author and the facts row shared by indexed and pending widget cards. */
export function WidgetCardBody({ item, official, href, lifetime, children }: { item: WidgetListItem; official: boolean; href?: string; lifetime: ReactNode; children?: ReactNode }) {
 return <div className={s.wbody}>
  <h3>{href ? <Link href={href}>{item.name}</Link> : item.name}</h3>
  <div className={s.byline}>{official ? <OfficialAuthor/> : <span>by <span {...stop}><AddressLink address={item.user}/></span></span>}</div>
  {children}
  <div className={s.meta}><span className={s.metaFacts}><ChartIcon type={item.chart}/>{CHART_LABELS[item.chart]}<span className={s.sep} aria-hidden="true">·</span>on {item.uses} {item.uses === 1 ? 'dashboard' : 'dashboards'}</span>{lifetime}</div>
 </div>
}
/** Explorer footer: open the widget page or add it to a dashboard. */
export function WidgetCardFoot({ href, onAdd }: { href: string; onAdd?(): void }) {
 return <footer className={s.foot}><Link className="btn btn-quiet btn-sm" href={href}>Open</Link><button type="button" className="btn btn-outline btn-sm" onClick={onAdd}><PlusIcon/>Add to dashboard</button></footer>
}

export function WidgetBrowseCard({ item, payload, head, version, variant, selected = false, disabled = false, onToggle, onAdd, visibleOverride, query, official = false }: {
 item: WidgetListItem; payload: WidgetEntity | null | undefined; head?: number; version: number; variant: 'explorer' | 'pick';
 official?: boolean; selected?: boolean; disabled?: boolean; onToggle?(): void; onAdd?(): void; visibleOverride?: boolean; query?: TimedResult
}) {
 const [ref, seen] = useInView<HTMLElement>()
 const visible = visibleOverride ?? seen
 const result = useWidgetQuery(payload?.widget, version, visible && !!payload && query === undefined)
 const preview = query ?? result
 const pick = variant === 'pick'
 const toggle = pick && !disabled
 const href = '/widgets/' + item.key
 return <article ref={ref} className={`${s.card} ${s.widget}`} style={{ '--lg': 4, '--md': 6, '--sm': 12 } as CSSProperties} data-selected={pick && selected ? 'true' : undefined} data-disabled={disabled ? 'true' : undefined}
  role={toggle ? 'button' : undefined} tabIndex={toggle ? 0 : undefined} aria-pressed={toggle ? selected : undefined}
  onClick={toggle ? onToggle : undefined} onKeyDown={toggle ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle?.() } } : undefined}>
  <div className={s.preview} style={{ height: pick ? 120 : 160 }}>
   {!visible ? <span style={{ opacity: 0.3 }}><ChartIcon type={item.chart} size={32}/></span>
    : payload === undefined || (!!payload && showLoading({ loading: preview.loading, data: preview.data })) ? <div className={`skel ${s.previewSkel}`} data-skeleton="true" aria-label="Loading preview"/>
    : !payload || preview.error ? <span className={s.previewNote}><ChartIcon type={item.chart} size={24}/>Preview unavailable</span>
    : <div className={s.previewFill}><WidgetPreview id={'browse-' + item.key} payload={payload.widget} query={preview}/></div>}
   {pick && selected && <span className={s.picked} aria-label="Selected"><CheckIcon/></span>}
  </div>
  <WidgetCardBody item={item} official={official} href={pick ? undefined : href} lifetime={official ? <KeptLive/> : <TimeLeft expiresAt={item.expiresAt} head={head}/>}>
   {disabled && <span className={s.note}>Already on this dashboard</span>}
  </WidgetCardBody>
  {!pick && <WidgetCardFoot href={href} onAdd={onAdd}/>}
 </article>
}
