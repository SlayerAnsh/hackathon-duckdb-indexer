'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { TIME_RANGES, resolveWidget, type Widget } from '../../lib/views'
import { useTimedQuery, type TimedResult } from '../../lib/use-query'
import { statSummary } from '../../lib/stat'
import { encodeSqlHash } from '../../lib/hash-state'
import { baseSpan, type CardSpan } from '../showcase/layout'
import { rangeFromSearch, searchForRange } from '../showcase/view-state'
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
import { AddressLink } from './AddressLink'

export const playgroundHref = (sql: string) => '/playground#' + encodeSqlHash(sql)

const CodeIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/></svg>
const RefreshIcon = ({ spin }: { spin: number }) => <svg key={spin} className={spin ? s.spinOnce : undefined} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5"/></svg>
const OpenIcon = () => <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5h6.5V10M12.5 3.5 4 12"/></svg>

/** One showcase query as a card. `paused` holds the last result when the data changes; `resume` reruns it when increased. */
export function WidgetCard({ widget: base, version, span, paused = false, resume = 0 }: { widget: Widget; version: number; span?: CardSpan; paused?: boolean; resume?: number }) {
 const [showSql, setShowSql] = useState(false)
 const [rangeId, setRangeId] = useState<string | undefined>(undefined)
 const [refresh, setRefresh] = useState(0)
 useEffect(() => { if (base.timeRange) setRangeId(rangeFromSearch(window.location.search, base)) }, [base])
 const widget = resolveWidget(base, rangeId)
 const q = useTimedQuery(widget.sql, version, { paused, nonce: refresh + resume })
 const isStat = widget.kind === 'stat'
 const fallback = baseSpan(widget)
 const style = { '--lg': span?.lg ?? fallback, '--md': span?.md ?? (fallback === 12 ? 12 : isStat ? 4 : 6), '--sm': span?.sm ?? (isStat ? 6 : 12) } as CSSProperties
 const kind = widget.kind === 'table' ? s.table : isStat ? s.stat : s.chart
 const sqlId = widget.id + '-sql'
 const sqlLabel = showSql ? 'Show result' : 'View SQL'
 function selectRange(id: string) {
  setRangeId(id)
  window.history.replaceState(null, '', window.location.pathname + searchForRange(window.location.search, base, id) + window.location.hash)
 }
 return <article className={`${s.card}${isStat ? ' ' + s.statCard : ''}`} id={widget.id} style={style} aria-busy={q.loading} aria-labelledby={widget.id + '-t'}>
  <header className={s.head}>
   <div className={s.titleRow}><h3 id={widget.id + '-t'}>{widget.title}</h3><NotInArkivQueryBadge reason={widget.notInArkivQuery}/></div>
   {(widget.subtitle || widget.activeRange) && <div className={s.subRow}>
    {widget.subtitle && <p>{widget.subtitle}</p>}
    {widget.activeRange && <RangePicker selected={widget.activeRange.id} onSelect={selectRange}/>}
   </div>}
  </header>
  <div className={`${s.body} ${kind}${showSql ? ' ' + s.sql : ''}`}>
   {showSql ? <div id={sqlId}><SqlBlock sql={widget.sql}/></div> : <WidgetBody widget={widget} query={q}/>}
  </div>
  <footer className={s.foot}>
   <div className={s.meta}><RunBadge ms={q.ms} rows={isStat ? undefined : q.data?.rows.length}/></div>
   <div className={s.actions}>
    <button type="button" className={`${s.action} ${s.icon}`} aria-label="Refresh" title="Rerun this query now" disabled={q.loading && refresh > 0} onClick={() => setRefresh(n => n + 1)}><RefreshIcon spin={refresh}/></button>
    <button type="button" className={s.action} aria-label={sqlLabel} title={sqlLabel} aria-expanded={showSql} aria-controls={showSql ? sqlId : undefined} onClick={() => setShowSql(v => !v)}><CodeIcon/><span>{showSql ? 'Result' : 'SQL'}</span></button>
    <Link className={`${s.action} ${s.primary}`} href={playgroundHref(widget.sql)} aria-label="Open in playground" title="Open in playground"><span>Open</span><OpenIcon/></Link>
   </div>
  </footer>
 </article>
}

function RangePicker({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
 return <div className={s.ranges} role="group" aria-label="Time range">
  {TIME_RANGES.map(r => <button key={r.id} type="button" aria-pressed={r.id === selected} onClick={() => onSelect(r.id)}>{r.label}</button>)}
 </div>
}

export function StatBody({ widget, data }: { widget: Widget; data: NonNullable<TimedResult['data']> }) {
 const sum = statSummary(widget, data)
 if (!sum) return <p className="empty">No rows yet</p>
 const pct = sum.share === undefined ? undefined : Math.round(sum.share * 1000) / 10
 return <>
  <div className="stat-value">{sum.value}</div>
  {sum.address && <div className={s.subject}>by <AddressLink address={sum.address}/></div>}
  <div className={s.note}>
   {pct !== undefined && <span className={s.meter} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={sum.note}><i style={{ width: pct > 0 ? `max(2px, ${pct}%)` : 0 }}/></span>}
   <span className={s.noteText}>{sum.note ?? '\u00a0'}</span>
  </div>
 </>
}

export function WidgetBody({ widget, query: q }: { widget: Widget; query: TimedResult }) {
 if (q.error) return <p className="error" role="status">{q.error}</p>
 if (!q.data) return <p className="empty">{q.loading ? 'Waiting for index…' : 'No rows yet'}</p>
 if (widget.kind === 'table') return <DataTable data={q.data}/>
 if (widget.kind === 'stat') return <StatBody widget={widget} data={q.data}/>
 const Chart = widget.kind === 'area' ? AreaChart : widget.kind === 'donut' ? DonutChart : widget.kind === 'stacked-bar' ? StackedBarChart : widget.kind === 'bar' ? HBarChart : ColumnChart
 return <Chart widget={widget} data={q.data}/>
}
