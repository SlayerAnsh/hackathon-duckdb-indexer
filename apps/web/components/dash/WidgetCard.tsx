'use client'
import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import type { Widget } from '../../lib/views'
import { useTimedQuery, type TimedResult } from '../../lib/use-query'
import { compact } from '../../lib/format'
import { encodeSqlHash } from '../../lib/hash-state'
import { baseSpan, type CardSpan } from '../showcase/layout'
import s from '../showcase/showcase.module.css'
import { RunBadge } from './RunBadge'
import { NotInArkivQueryBadge } from './NotInArkivQueryBadge'
import { SqlBlock } from './SqlBlock'
import { DataTable } from './DataTable'
import { AreaChart } from './AreaChart'
import { HBarChart } from './HBarChart'
import { StackedBarChart } from './StackedBarChart'
import { ColumnChart } from './ColumnChart'
import { DonutChart } from './DonutChart'

export const playgroundHref = (sql: string) => '/playground#' + encodeSqlHash(sql)

export function WidgetCard({ widget, version, span }: { widget: Widget; version: number; span?: CardSpan }) {
 const [showSql, setShowSql] = useState(false)
 const q = useTimedQuery(widget.sql, version)
 const fallback = baseSpan(widget)
 const style = { '--lg': span?.lg ?? fallback, '--md': span?.md ?? (fallback === 12 ? 12 : 6) } as CSSProperties
 const kind = widget.kind === 'table' ? s.table : widget.kind === 'stat' ? s.stat : s.chart
 const sqlId = widget.id + '-sql'
 return <article className={s.card} id={widget.id} style={style} aria-busy={q.loading} aria-labelledby={widget.id + '-t'}>
  <header className={s.head}>
   <h3 id={widget.id + '-t'}>{widget.title}</h3>
   {widget.subtitle && <p>{widget.subtitle}</p>}
  </header>
  <div className={`${s.body} ${kind}${showSql ? ' ' + s.sql : ''}`}>
   {showSql ? <div id={sqlId}><SqlBlock sql={widget.sql}/></div> : <WidgetBody widget={widget} query={q}/>}
  </div>
  <footer className={s.foot}>
   <div className={s.meta}><RunBadge ms={q.ms} rows={q.data?.rows.length}/><NotInArkivQueryBadge reason={widget.notInArkivQuery}/></div>
   <div className={s.actions}>
    <button type="button" className={s.action} aria-expanded={showSql} aria-controls={showSql ? sqlId : undefined} onClick={() => setShowSql(v => !v)}>{showSql ? 'Show result' : 'View SQL'}</button>
    <Link className={`${s.action} ${s.primary}`} href={playgroundHref(widget.sql)}>Open in playground</Link>
   </div>
  </footer>
 </article>
}

export function WidgetBody({ widget, query: q }: { widget: Widget; query: TimedResult }) {
 if (q.error) return <p className="error" role="status">{q.error}</p>
 if (!q.data) return <p className="empty">{q.loading ? 'Waiting for index…' : 'No rows yet'}</p>
 if (widget.kind === 'table') return <DataTable data={q.data}/>
 if (widget.kind === 'stat') return <div className="stat-value">{q.data.rows[0]?.[0] == null ? 'No rows yet' : compact(Number(q.data.rows[0][0]))}</div>
 const Chart = widget.kind === 'area' ? AreaChart : widget.kind === 'donut' ? DonutChart : widget.kind === 'stacked-bar' ? StackedBarChart : widget.kind === 'bar' ? HBarChart : ColumnChart
 return <Chart widget={widget} data={q.data}/>
}
