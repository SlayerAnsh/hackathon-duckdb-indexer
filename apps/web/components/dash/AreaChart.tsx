'use client'
import { ResponsiveContainer, AreaChart as AreaPlot, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Label, LineChart, Line, LabelList } from 'recharts'
import { formatNumber } from '../../lib/dash/chart'
import type { Widget } from '../../lib/views'
import type { TableData } from './DataTable'
import { compact, shortHex } from '../../lib/format'
import s from '../showcase/showcase.module.css'

const colors = Array.from({ length: 8 }, (_, i) => `var(--c${i + 1})`)
export type ChartProps = { widget: Widget; data: TableData }
const numeric = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export function QueryChart({ widget, data }: ChartProps) {
 if (!data.rows.length) return <p className="empty">No rows yet</p>
 const y = Array.isArray(widget.y) ? widget.y : [widget.y ?? 'count']
 const x = widget.x ?? data.columns[0]
 let rows: Record<string, string | number>[] = data.rows.map(row => Object.fromEntries(
  data.columns.map((c, i) => [c, y.includes(c) ? numeric(row[i]) : String(row[i] ?? '')])
 ))
 let keys = y
 if (widget.series) {
  keys = [...new Set(rows.map(r => String(r[widget.series!])))]
  const grouped = new Map<string, Record<string, string | number>>()
  for (const row of rows) {
   const label = String(row[x])
   const r = grouped.get(label) ?? { [x]: label }
   r[String(row[widget.series])] = numeric(row[y[0]])
   grouped.set(label, r)
  }
  rows = [...grouped.values()]
 }
 const color = (key: string, i: number) => widget.colors?.[key] ?? colors[i % 8]
 const stackId = widget.stacking === 'stack' || widget.stacking === 'percent' || (widget.stacking === undefined && widget.series) ? 'total' : undefined
 const tickFormatter = widget.stacking === 'percent' ? (v: unknown) => formatNumber(v, '0.00%') : widget.numberFormat ? (v: unknown) => formatNumber(v, widget.numberFormat!) : undefined
 const valueLabel = widget.labels ? <LabelList formatter={v => widget.numberFormat ? formatNumber(v, widget.numberFormat) : String(v ?? '')}/> : undefined
 const total = rows.reduce((sum, row) => sum + numeric(row[y[0]]), 0)
 const tip = <Tooltip contentStyle={{ background: 'var(--card-2)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }} itemStyle={{ color: 'var(--text)' }}/>
 const axes = <>
  <CartesianGrid stroke="var(--grid)" vertical={false}/>
  <XAxis dataKey={x} tickFormatter={v => shortHex(String(v))} tickLine={false} axisLine={false} minTickGap={24} label={widget.xTitle ? { value: widget.xTitle, position: 'insideBottom' } : undefined}/>
  <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={tickFormatter} label={widget.yTitle ? { value: widget.yTitle, angle: -90, position: 'insideLeft' } : undefined}/>
 </>
 const frame = (
  <div className="chart-frame" role="img" aria-label={widget.title}>
   <ResponsiveContainer width="100%" height="100%" minWidth={0}>
    {widget.kind === 'donut' ? <PieChart>
     <Pie data={rows} nameKey={x} dataKey={y[0]} innerRadius="55%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
      {rows.map((_, i) => <Cell key={i} fill={color(String(rows[i][x]), i)}/>)}
      <Label value={widget.numberFormat ? formatNumber(total, widget.numberFormat) : compact(total)} position="center" fill="var(--text)"/>
     </Pie>{tip}
    </PieChart> : widget.kind === 'line' ? <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
     {axes}{keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={color(k, i)} strokeWidth={2} dot={false} isAnimationActive={false}>{valueLabel}</Line>)}{tip}
    </LineChart> : widget.kind === 'area' ? <AreaPlot stackOffset={widget.stacking === 'percent' ? 'expand' : undefined} data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
     {axes}{keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stackId={stackId} stroke={color(k, i)} fill={color(k, i)} fillOpacity={.15} isAnimationActive={false}/>)}{tip}
    </AreaPlot> : widget.kind === 'bar' ? <BarChart stackOffset={widget.stacking === 'percent' ? 'expand' : undefined} data={rows} layout="vertical" margin={{ left: 0, right: 16 }}>
     <CartesianGrid stroke="var(--grid)" horizontal={false}/><XAxis type="number" tickFormatter={tickFormatter} tickLine={false} axisLine={false} label={widget.xTitle ? { value: widget.xTitle, position: 'insideBottom' } : undefined}/>
     <YAxis dataKey={x} type="category" width={100} tickLine={false} axisLine={false} tickFormatter={v => shortHex(String(v))} label={widget.yTitle ? { value: widget.yTitle, angle: -90, position: 'insideLeft' } : undefined}/>
     {keys.map((k, i) => <Bar key={k} dataKey={k} stackId={stackId} fill={color(k, i)} radius={[0, 3, 3, 0]} isAnimationActive={false}>{valueLabel}</Bar>)}{tip}
    </BarChart> : <BarChart barCategoryGap={widget.binned ? 0 : undefined} stackOffset={widget.stacking === 'percent' ? 'expand' : undefined} data={rows} margin={{ right: 16 }}>
     {axes}{keys.map((k, i) => <Bar key={k} dataKey={k} stackId={stackId} fill={color(k, i)} radius={[3, 3, 0, 0]} isAnimationActive={false}>{valueLabel}</Bar>)}{tip}
    </BarChart>}
   </ResponsiveContainer>
  </div>
 )
 if (widget.kind === 'donut') return <div className={s.donut}>
  {frame}
  {(widget.legend ?? true) && <ul className="legend legend-col">
   {rows.map((r, i) => <li key={i}><i style={{ background: color(String(r[x]), i) }}/><span className="lg-n" title={String(r[x])}>{shortHex(String(r[x]))}</span><span className="lg-v">{widget.numberFormat ? formatNumber(numeric(r[y[0]]), widget.numberFormat) : compact(numeric(r[y[0]]))}</span><span className="lg-p">{total ? (numeric(r[y[0]]) / total * 100).toFixed(1) : '0.0'}%</span></li>)}
  </ul>}
 </div>
 return <>
  {frame}
  {(widget.legend ?? true) && keys.length >= 2 && <div className="chart-key">
   {keys.map((k, i) => <span key={k}><i style={{ background: color(k, i) }}/>{shortHex(k)}</span>)}
  </div>}
 </>
}
export function AreaChart(props: ChartProps) { return <QueryChart {...props}/> }
