'use client'
import { useState, type CSSProperties } from 'react'
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

export function SavedWidgetCard({ id, name, payload, status, size, version, head, expiresAt, widgetKey, owner, query }: {
 id: string; name: string; payload: WidgetPayload | null; status: SlotStatus; size: Size; version: number; head?: number;
 expiresAt?: number; widgetKey?: string; owner?: boolean; query?: TimedResult
}) {
 const [showSql, setShowSql] = useState(false)
 const result = useWidgetQuery(payload, version, status === 'live' && query === undefined)
 const q = query ?? result
 const live = status === 'live' && payload !== null
 const stat = live && payload.chart === 'counter'
 const kind = stat ? s.stat : live && payload.chart === 'table' ? s.table : s.chart
 const style = { '--lg': SIZE_SPAN[size], '--md': size === 'xs' || size === 'sm' ? 6 : 12, '--sm': 12 } as CSSProperties
 const sqlId = id + '-sql'
 return <article id={id} className={`${s.card}${stat ? ' ' + s.statCard : ''}`} style={style} aria-labelledby={id + '-t'} aria-busy={status === 'loading' || (live && q.loading)}>
  <header className={s.head}><h3 id={id + '-t'}>{name}</h3></header>
  <div className={`${s.body} ${kind}${live && showSql ? ' ' + s.sql : ''}`}>
   {status === 'loading' ? <div aria-label="Loading widget" style={{ height: 240, background: 'var(--card-2)', borderRadius: 'var(--r-md)' }}/> : !live ? <div style={{ margin: 'auto', textAlign: 'center' }}>
    <span className="state state-stale">Expired</span>
    <p style={{ color: 'var(--text-3)' }}>This widget is no longer on Arkiv, so nothing runs.</p>
    {owner && <p style={{ color: 'var(--text-3)' }}>Remove it on Organize.</p>}
   </div> : showSql ? <div id={sqlId}><SqlBlock sql={payload.sql}/></div> : <WidgetPreview id={id} payload={payload} query={q}/>}
  </div>
  {live && <footer className={s.foot}>
   <div className={s.meta}><RunBadge ms={q.ms} rows={stat ? undefined : q.data?.rows.length}/>{expiresAt !== undefined && <TimeLeft expiresAt={expiresAt} head={head}/>}</div>
   <div className={s.actions}>
    <button type="button" className={s.action} aria-label={showSql ? 'Show result' : 'View SQL'} aria-expanded={showSql} aria-controls={showSql ? sqlId : undefined} onClick={() => setShowSql(value => !value)}>{showSql ? 'Result' : 'SQL'}</button>
    {widgetKey && <Link className={`${s.action} ${s.primary}`} href={'/widgets/' + widgetKey}>Open</Link>}
   </div>
  </footer>}
 </article>
}
