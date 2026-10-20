'use client'
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { StarIcon } from './StarIcon'
import { SIZE_SPAN, type Size, type WidgetPayload } from '../../lib/dash/schema'
import type { SlotStatus } from '../../lib/dash/slots'
import { useWidgetQuery } from '../../lib/dash/use-widget-query'
import type { TimedResult } from '../../lib/use-query'
import { RunBadge } from '../dash/RunBadge'
import { cx } from '../dash/cx'
import { WidgetPreview } from './WidgetPreview'
import { TimeLeft } from './TimeLeft'
import s from '../showcase/showcase.module.css'
import r from './report.module.css'

/** Edit mode chrome for a figure on Organize: strips above and below the tile replace the view actions, and the tile can be selected and dragged. */
export type FigureEdit = { header: ReactNode; footer: ReactNode; selected: boolean; dragging?: boolean; flash?: boolean; rootRef?(node: HTMLElement | null): void; transform?: string; transition?: string; onSelect?(): void }
/** Grid spans for one figure: desktop 12 column span, mid width span and phone span. */
export function figureSpans(size: Size): CSSProperties {
 return { '--lg': SIZE_SPAN[size], '--md': size === 'xs' || size === 'sm' ? 6 : 12, '--sm': 12 } as CSSProperties
}

export function SavedWidgetCard({ id, name, payload, status, size, version, head, expiresAt, widgetKey, owner, query, figure, subtitle, official, initialActionsOpen = false, edit, starred }: {
 id: string; name: string; payload: WidgetPayload | null; status: SlotStatus; size: Size; version: number; head?: number;
 expiresAt?: number; widgetKey?: string; owner?: boolean; query?: TimedResult; figure?: number; subtitle?: string | null; official?: boolean; initialActionsOpen?: boolean; edit?: FigureEdit; starred?: boolean
}) {
 const [actionsOpen, setActionsOpen] = useState(initialActionsOpen)
 const overflow = useRef<HTMLButtonElement>(null)
 const result = useWidgetQuery(payload, version, status === 'live' && query === undefined)
 const q = query ?? result
 const live = status === 'live' && payload !== null
 const stat = live && payload.chart === 'counter'
 const kind = stat ? s.stat : live && payload.chart === 'table' ? s.table : s.chart
 const style = { ...figureSpans(size), transform: edit?.transform, transition: edit?.transition }
 if (edit) return <article id={id} ref={edit.rootRef} className={cx(r.figure, stat && r.counter, r.editing)} style={style} aria-labelledby={id + '-t'} aria-busy={status === 'loading' || (live && q.loading)}
  data-actions-open={edit.selected || edit.dragging || undefined} data-selected={edit.selected || undefined} data-dragging={edit.dragging || undefined} data-flash={edit.flash || undefined} onClick={edit.onSelect}>
  <header className={r.caption}><div>{!stat && figure !== undefined && <div className={r.number}>Figure {figure}</div>}<h3 id={id + '-t'}>{name}{starred && <span aria-label="Cover widget" style={{ color: "var(--accent)", marginLeft: 8 }}><StarIcon filled/></span>}</h3>{subtitle && <p className={r.subtitle}>{subtitle}</p>}</div></header>
  <div className={`${r.body} ${kind}`}>
   {status === 'loading' ? <div className={cx('skel', r.loading)} aria-label="Loading widget"/> : !live ? <div className={r.expired}>
    <span className="state state-stale">Expired</span>
    <p>This widget is no longer on Arkiv, so nothing runs. Remove it to free the slot.</p>
   </div> : <WidgetPreview id={id} payload={payload} query={q}/>}
  </div>
  <div className={cx(r.strip, r.stripHead)} role="group" aria-label={'Move or remove ' + name}>{edit.header}</div>
  <div className={cx(r.strip, r.stripFoot)} role="group" aria-label={'Size and lifetime of ' + name}>{edit.footer}</div>
 </article>
 return <article id={id} className={`${r.figure}${stat ? ' ' + r.counter : ''}`} style={style} aria-labelledby={id + '-t'} aria-busy={status === 'loading' || (live && q.loading)} data-actions-open={actionsOpen}
  onKeyDown={event => { if (event.key === 'Escape' && actionsOpen) { event.preventDefault(); setActionsOpen(false); overflow.current?.focus() } }}>
  <header className={r.caption}>
   <div>{!stat && figure !== undefined && <div className={r.number}>Figure {figure}</div>}<h3 id={id + '-t'}>{name}{starred && <span aria-label="Cover widget" style={{ color: "var(--accent)", marginLeft: 8 }}><StarIcon filled/></span>}</h3>{subtitle && <p className={r.subtitle}>{subtitle}</p>}</div>
   {live && <button ref={overflow} type="button" className={`ib ${r.overflow}`} aria-label={'Actions for ' + name} aria-expanded={actionsOpen} aria-controls={id + '-actions'} onClick={() => setActionsOpen(value => !value)}><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="13" cy="8" r="1"/></svg></button>}
  </header>
  <div className={`${r.body} ${kind}`}>
   {status === 'loading' ? <div className={cx('skel', r.loading)} aria-label="Loading widget"/> : !live ? <div className={r.expired}>
    <span className="state state-stale">Expired</span>
    <p>This widget is no longer on Arkiv, so nothing runs.</p>
    {owner && <p>Remove it on Organize.</p>}
   </div> : <WidgetPreview id={id} payload={payload} query={q}/>}
  </div>
  {live && <div className={r.actions} id={id + '-actions'}>
   <RunBadge ms={q.ms} rows={stat ? undefined : q.data?.rows.length}/>
   {widgetKey && <Link className="ib has-tip" data-tip="Open widget" aria-label={'Open widget ' + name} href={'/widgets/' + widgetKey}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 2H2v12h12v-4M9 2h5v5M7 9l7-7"/></svg></Link>}
   {official ? <span className="chip chip-official"><span aria-hidden="true">⛨</span>Kept live</span> : expiresAt !== undefined && <TimeLeft expiresAt={expiresAt} head={head}/>}
  </div>}
 </article>
}
