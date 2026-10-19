'use client'
import { useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { SIZE_SPAN, type Size, type WidgetPayload } from '../../lib/dash/schema'
import type { SlotStatus } from '../../lib/dash/slots'
import { useWidgetQuery } from '../../lib/dash/use-widget-query'
import type { TimedResult } from '../../lib/use-query'
import { RunBadge } from '../dash/RunBadge'
import { SqlBlock } from '../dash/SqlBlock'
import { WidgetPreview } from './WidgetPreview'
import { TimeLeft } from './TimeLeft'
import s from '../showcase/showcase.module.css'
import r from './report.module.css'

export function SavedWidgetCard({ id, name, payload, status, size, version, head, expiresAt, widgetKey, owner, query, figure, subtitle, official, initialActionsOpen = false }: {
 id: string; name: string; payload: WidgetPayload | null; status: SlotStatus; size: Size; version: number; head?: number;
 expiresAt?: number; widgetKey?: string; owner?: boolean; query?: TimedResult; figure?: number; subtitle?: string | null; official?: boolean; initialActionsOpen?: boolean
}) {
 const [actionsOpen, setActionsOpen] = useState(initialActionsOpen)
 const overflow = useRef<HTMLButtonElement>(null)
 const [showSql, setShowSql] = useState(false)
 const result = useWidgetQuery(payload, version, status === 'live' && query === undefined)
 const q = query ?? result
 const live = status === 'live' && payload !== null
 const stat = live && payload.chart === 'counter'
 const kind = stat ? s.stat : live && payload.chart === 'table' ? s.table : s.chart
 const style = { '--lg': SIZE_SPAN[size], '--md': size === 'xs' || size === 'sm' ? 6 : 12, '--sm': 12 } as CSSProperties
 const sqlId = id + '-sql'
 return <article id={id} className={`${r.figure}${stat ? ' ' + r.counter : ''}`} style={style} aria-labelledby={id + '-t'} aria-busy={status === 'loading' || (live && q.loading)} data-actions-open={actionsOpen}
  onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setActionsOpen(false); overflow.current?.focus() } }}>
  <header className={r.caption}>
   <div>{!stat && figure !== undefined && <div className={r.number}>Figure {figure}</div>}<h3 id={id + '-t'}>{name}</h3>{subtitle && <p className={r.subtitle}>{subtitle}</p>}</div>
   {live && <button ref={overflow} type="button" className={`ib ${r.overflow}`} aria-label={'Actions for ' + name} aria-expanded={actionsOpen} aria-controls={id + '-actions'} onClick={() => setActionsOpen(value => !value)}><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1"/><circle cx="8" cy="8" r="1"/><circle cx="13" cy="8" r="1"/></svg></button>}
  </header>
  <div className={`${r.body} ${kind}`}>
   {status === 'loading' ? <div aria-label="Loading widget" style={{ height: 240, background: 'var(--card-2)', borderRadius: 'var(--r-md)' }}/> : !live ? <div style={{ margin: 'auto', textAlign: 'center' }}>
    <span className="state state-stale">Expired</span>
    <p style={{ color: 'var(--text-3)' }}>This widget is no longer on Arkiv, so nothing runs.</p>
    {owner && <p style={{ color: 'var(--text-3)' }}>Remove it on Organize.</p>}
   </div> : <WidgetPreview id={id} payload={payload} query={q}/>}
  </div>
  {live && showSql && <div className={r.sql} id={sqlId}><SqlBlock sql={payload.sql}/></div>}
  {live && <div className={r.actions} id={id + '-actions'}>
   <RunBadge ms={q.ms} rows={stat ? undefined : q.data?.rows.length}/>
   <button type="button" className="ib tip" data-tip={showSql ? 'Hide SQL' : 'View SQL'} aria-label={(showSql ? 'Hide SQL for ' : 'View SQL for ') + name} aria-expanded={showSql} aria-controls={showSql ? sqlId : undefined} onClick={() => setShowSql(value => !value)}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m5 4-4 4 4 4m6-8 4 4-4 4M9 2 7 14"/></svg></button>
   {widgetKey && <Link className="ib tip" data-tip="Open widget" aria-label={'Open widget ' + name} href={'/widgets/' + widgetKey}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M6 2H2v12h12v-4M9 2h5v5M7 9l7-7"/></svg></Link>}
   {official ? <span className="chip chip-official"><span aria-hidden="true">⛨</span>Kept live</span> : expiresAt !== undefined && <TimeLeft expiresAt={expiresAt} head={head}/>}
  </div>}
 </article>
}
