'use client'
import { ResponsiveContainer, AreaChart as AreaPlot, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Label } from 'recharts'
import type { Widget } from '../../lib/views'
import type { TableData } from './DataTable'
import { compact, shortHex } from '../../lib/format'

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
 const total = rows.reduce((sum, row) => sum + numeric(row[y[0]]), 0)
 const tip = <Tooltip contentStyle={{ background: 'var(--card-2)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }} itemStyle={{ color: 'var(--text)' }}/>
 const axes = <>
  <CartesianGrid stroke="var(--grid)" vertical={false}/>
  <XAxis dataKey={x} tickFormatter={v => shortHex(String(v))} tickLine={false} axisLine={false} minTickGap={24}/>
  <YAxis tickLine={false} axisLine={false} width={44}/>
 </>
 const legend = widget.kind === 'donut' ? rows.map(r => String(r[x])) : keys
 return <>
  <div className="chart-frame" role="img" aria-label={widget.title}>
   <ResponsiveContainer width="100%" height="100%" minWidth={0}>
    {widget.kind === 'donut' ? <PieChart>
     <Pie data={rows} nameKey={x} dataKey={y[0]} innerRadius="55%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
      {rows.map((_, i) => <Cell key={i} fill={colors[i % 8]}/>)}
      <Label value={compact(total)} position="center" fill="var(--text)"/>
     </Pie>{tip}
    </PieChart> : widget.kind === 'area' ? <AreaPlot data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
     {axes}{keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stroke={colors[i % 8]} fill={colors[i % 8]} fillOpacity={.15} isAnimationActive={false}/>)}{tip}
    </AreaPlot> : widget.kind === 'bar' ? <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 16 }}>
     <CartesianGrid stroke="var(--grid)" horizontal={false}/><XAxis type="number"/>
     <YAxis dataKey={x} type="category" width={100} tickFormatter={v => shortHex(String(v))}/>
     {keys.map((k, i) => <Bar key={k} dataKey={k} fill={colors[i % 8]} radius={[0, 3, 3, 0]} isAnimationActive={false}/>)}{tip}
    </BarChart> : <BarChart data={rows} margin={{ right: 16 }}>
     {axes}{keys.map((k, i) => <Bar key={k} dataKey={k} stackId={widget.series ? 'total' : undefined} fill={colors[i % 8]} radius={[3, 3, 0, 0]} isAnimationActive={false}/>)}{tip}
    </BarChart>}
   </ResponsiveContainer>
  </div>
  {widget.kind === 'donut' ? <ul className="legend legend-col">
   {rows.map((r, i) => <li key={i}><i style={{ background: colors[i % 8] }}/><span className="lg-n" title={String(r[x])}>{shortHex(String(r[x]))}</span><span className="lg-v">{compact(numeric(r[y[0]]))}</span><span className="lg-p">{total ? (numeric(r[y[0]]) / total * 100).toFixed(1) : '0.0'}%</span></li>)}
  </ul> : legend.length >= 2 && <div className="chart-key">
   {legend.map((k, i) => <span key={k}><i style={{ background: colors[i % 8] }}/>{shortHex(k)}</span>)}
  </div>}
 </>
}
export function AreaChart(props: ChartProps) { return <QueryChart {...props}/> }
