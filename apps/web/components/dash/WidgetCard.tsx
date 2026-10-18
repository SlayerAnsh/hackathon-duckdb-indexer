import { useState, type CSSProperties } from 'react'
import type { Widget } from '../../lib/views'
import { useTimedQuery, type TimedResult } from '../../lib/use-query'
import { useIndex } from '../../lib/use-index'
import { compact } from '../../lib/format'
import { toCsv } from '../../lib/csv'
import { RunBadge } from './RunBadge'
import { NotInArkivQueryBadge } from './NotInArkivQueryBadge'
import { SqlBlock } from './SqlBlock'
import { DataTable } from './DataTable'
import { AreaChart } from './AreaChart'
import { HBarChart } from './HBarChart'
import { StackedBarChart } from './StackedBarChart'
import { ColumnChart } from './ColumnChart'
import { DonutChart } from './DonutChart'

export function WidgetCard({ widget, version, onSql }: { widget: Widget; version: number; onSql: (s: string) => void }) {
 const [rerun, setRerun] = useState(0)
 const [exporting, setExporting] = useState(false)
 const [exportError, setExportError] = useState('')
 const { db } = useIndex()
 const q = useTimedQuery(widget.sql, version + rerun)

 async function download() {
  if (!db || exporting) return
  setExporting(true)
  setExportError('')
  try {
   const full = await db.run(widget.sql, Infinity)
   const url = URL.createObjectURL(new Blob([toCsv(full.columns, full.rows)], { type: 'text/csv;charset=utf-8' }))
   const link = document.createElement('a')
   link.href = url
   link.download = widget.id + '.csv'
   link.click()
   setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (error) {
   setExportError(String(error))
  } finally {
   setExporting(false)
  }
 }

 return <article className="w" id={widget.id} style={{ '--span': (widget.span ?? 1) * 4 } as CSSProperties} aria-busy={q.loading}>
  <header className="w-h">
   <div className="w-t"><h3>{widget.title}</h3>{widget.subtitle && <p className="w-r">{widget.subtitle}</p>}</div>
   <div className="w-m"><NotInArkivQueryBadge reason={widget.notInArkivQuery}/><RunBadge ms={q.ms} rows={q.data?.rows.length}/></div>
  </header>
  {widget.notInArkivQuery && <code className="w-clause">{widget.notInArkivQuery}</code>}
  <div className="w-b">
   <WidgetBody widget={widget} query={q}/>
   {exportError && <p className="error">{exportError}</p>}
  </div>
  <footer className="w-f">
   <details className="w-sql"><summary>› SQL</summary><SqlBlock sql={widget.sql}/></details>
   <div className="w-acts">
    <button className="btn btn-quiet" disabled={!db || exporting} onClick={() => void download()}>↓ CSV</button>
    <button className="btn btn-quiet" onClick={() => onSql(widget.sql)}>Open in console</button>
    <button className="btn btn-run" disabled={!db || q.loading} onClick={() => setRerun(n => n + 1)}>▶ Run</button>
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
