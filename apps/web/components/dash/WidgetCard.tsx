'use client'
import { type Widget } from '../../lib/views'
import { type TimedResult } from '../../lib/use-query'
import { statSummary } from '../../lib/stat'
import { encodeSqlHash } from '../../lib/hash-state'
import s from '../showcase/showcase.module.css'
import { DataTable } from './DataTable'
import d from './data.module.css'
import { AreaChart } from './AreaChart'
import { HBarChart } from './HBarChart'
import { StackedBarChart } from './StackedBarChart'
import { ColumnChart } from './ColumnChart'
import { DonutChart } from './DonutChart'
import { AddressLink } from './AddressLink'
import { cx } from './cx'

export const playgroundHref = (sql: string) => '/playground#' + encodeSqlHash(sql)

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
 if (q.error) return <p className={cx('error', d.error)} role="status">{q.error}</p>
 if (!q.data && q.loading) return <div className={widget.kind === 'stat' ? undefined : d.loading} role="status" aria-busy="true">
  {widget.kind === 'stat' ? <span className="skel" style={{ width: '45%', height: 32, marginBottom: 8 }}/> : <span className={cx('skel', d.loadBlock)}/>}
  <span className={d.caption}>Waiting for index…</span>
 </div>
 if (!q.data) return <p className={cx('empty', d.empty)}>No rows yet</p>
 if (widget.kind === 'table') return <DataTable data={q.data}/>
 if (widget.kind === 'stat') return <StatBody widget={widget} data={q.data}/>
 const Chart = widget.kind === 'area' ? AreaChart : widget.kind === 'donut' ? DonutChart : widget.kind === 'stacked-bar' ? StackedBarChart : widget.kind === 'bar' ? HBarChart : ColumnChart
 return <Chart widget={widget} data={q.data}/>
}
