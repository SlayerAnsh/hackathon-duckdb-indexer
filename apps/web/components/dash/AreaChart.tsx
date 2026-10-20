'use client'
import { ResponsiveContainer, AreaChart as AreaPlot, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Label, LineChart, Line, LabelList } from 'recharts'
import { formatNumber } from '../../lib/dash/chart'
import type { Widget } from '../../lib/views'
import type { TableData } from './DataTable'
import { compact, shortHex } from '../../lib/format'
import s from './charts.module.css'
import { cx } from './cx'

const colors = Array.from({ length: 8 }, (_, i) => `var(--c${i + 1})`)
export type ChartProps = { widget: Widget; data: TableData }
const numeric = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const TICK = { fill: 'var(--text-3b)', fontSize: 11, fontFamily: 'var(--font-mono)' }
const MARGIN = { top: 8, right: 16, bottom: 0, left: 0 }

type TipEntry = { name?: string | number; value?: unknown; color?: string; fill?: string; dataKey?: unknown; payload?: Record<string, unknown> }
/** Tooltip body in the shared `.tip` box: category on top, one row per series. */
function ChartTip({ active, payload, label, format, title }: { active?: boolean; payload?: readonly TipEntry[]; label?: unknown; format: (v: unknown) => string; title?: string }) {
 if (!active || !payload?.length) return null
 const head = title ?? String(label ?? '')
 return <div className="tip">
  {head && <div className={cx('tip-h', s.tipHead)} title={head}>{shortHex(head)}</div>}
  {payload.map((p, i) => <div key={i} className={cx('tip-r', s.tipRow)}>
   <i style={{ background: p.color ?? p.fill ?? String(p.payload?.fill ?? colors[0]) }}/>
   <span>{shortHex(String(p.name ?? p.dataKey ?? ''))}</span>
   <b>{format(p.value)}</b>
  </div>)}
 </div>
}

export function QueryChart({ widget, data }: ChartProps) {
 if (!data.rows.length) return <p className={cx('empty', s.empty)}>No rows yet<span className={s.emptyHint}>The query returned an empty result.</span></p>
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
 const percent = widget.stacking === 'percent'
 const tickFormatter = percent ? (v: unknown) => formatNumber(v, '0.00%') : widget.numberFormat ? (v: unknown) => formatNumber(v, widget.numberFormat!) : (v: unknown) => compact(numeric(v))
 const valueText = (v: unknown) => widget.numberFormat ? formatNumber(v, widget.numberFormat) : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v ?? '')
 const valueLabel = widget.labels ? <LabelList formatter={v => widget.numberFormat ? formatNumber(v, widget.numberFormat) : String(v ?? '')}/> : undefined
 const total = rows.reduce((sum, row) => sum + numeric(row[y[0]]), 0)
 const tip = (cursor: object | false, title?: string) => <Tooltip isAnimationActive={false} cursor={cursor} wrapperStyle={{ outline: 'none' }} content={p => <ChartTip active={p.active} payload={stackId && p.payload ? [...(p.payload as readonly TipEntry[])].reverse() : p.payload as readonly TipEntry[] | undefined} label={p.label} format={valueText} title={title}/>}/>
 const lineCursor = { stroke: 'var(--border-strong)', strokeWidth: 1 }
 const barCursor = { fill: 'var(--text)', fillOpacity: .05 }
 const xTitle = widget.xTitle ? { value: widget.xTitle, position: 'insideBottom' as const, offset: -2 } : undefined
 const yTitle = widget.yTitle ? { value: widget.yTitle, angle: -90, position: 'insideLeft' as const, style: { textAnchor: 'middle' as const } } : undefined
 const axes = <>
  <CartesianGrid stroke="var(--grid)" vertical={false}/>
  <XAxis dataKey={x} tick={TICK} tickFormatter={v => shortHex(String(v))} tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tickMargin={8} minTickGap={16} interval="preserveStartEnd" height={xTitle ? 44 : 28} label={xTitle}/>
  <YAxis tick={TICK} tickLine={false} axisLine={false} width={yTitle ? 56 : 44} tickMargin={6} tickCount={5} tickFormatter={tickFormatter} label={yTitle}/>
 </>
 const frame = (
  <div className={cx('chart-frame', s.frame)} role="img" aria-label={widget.title}>
   <ResponsiveContainer width="100%" height="100%" minWidth={0}>
    {widget.kind === 'donut' ? <PieChart>
     <Pie data={rows} nameKey={x} dataKey={y[0]} innerRadius="62%" outerRadius="88%" paddingAngle={1.5} stroke="var(--card)" strokeWidth={1} isAnimationActive={false}>
      {rows.map((_, i) => <Cell key={i} fill={color(String(rows[i][x]), i)}/>)}
      <Label position="center" content={props => {
       const { x: cx, y: cy } = props as { x?: number | string; y?: number | string }
       if (cx === undefined || cy === undefined) return null
       return <g className={s.center}>
        <text x={cx} y={Number(cy) - 2} textAnchor="middle" className={s.centerValue}>{widget.numberFormat ? formatNumber(total, widget.numberFormat) : compact(total)}</text>
        <text x={cx} y={Number(cy) + 15} textAnchor="middle" className={s.centerLabel}>total</text>
       </g>
      }}/>
     </Pie>{tip(false)}
    </PieChart> : widget.kind === 'line' ? <LineChart data={rows} margin={MARGIN}>
     {axes}{keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={color(k, i)} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} isAnimationActive={false}>{valueLabel}</Line>)}{tip(lineCursor)}
    </LineChart> : widget.kind === 'area' ? <AreaPlot stackOffset={percent ? 'expand' : undefined} data={rows} margin={MARGIN}>
     {axes}{keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stackId={stackId} stroke={color(k, i)} strokeWidth={1.75} fill={color(k, i)} fillOpacity={keys.length > 1 ? .22 : .14} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} isAnimationActive={false}/>)}{tip(lineCursor)}
    </AreaPlot> : widget.kind === 'bar' ? <BarChart stackOffset={percent ? 'expand' : undefined} data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap="24%">
     <CartesianGrid stroke="var(--grid)" horizontal={false}/>
     <XAxis type="number" tick={TICK} tickFormatter={tickFormatter} tickLine={false} axisLine={false} tickMargin={6} tickCount={5} minTickGap={16} height={xTitle ? 44 : 24} label={xTitle}/>
     <YAxis dataKey={x} type="category" tick={{ ...TICK, fill: 'var(--text-2)' }} width={104} tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tickMargin={8} interval={0} tickFormatter={v => { const t = shortHex(String(v)); return t.length > 14 ? t.slice(0, 13) + '…' : t }} label={yTitle}/>
     {keys.map((k, i) => <Bar key={k} dataKey={k} stackId={stackId} fill={color(k, i)} maxBarSize={22} radius={stackId && i < keys.length - 1 ? 0 : [0, 3, 3, 0]} isAnimationActive={false}>{valueLabel}</Bar>)}{tip(barCursor)}
    </BarChart> : <BarChart barCategoryGap={widget.binned ? 1 : '24%'} stackOffset={percent ? 'expand' : undefined} data={rows} margin={MARGIN}>
     {axes}{keys.map((k, i) => <Bar key={k} dataKey={k} stackId={stackId} fill={color(k, i)} maxBarSize={widget.binned ? undefined : 40} radius={stackId && i < keys.length - 1 ? 0 : widget.binned ? [2, 2, 0, 0] : [3, 3, 0, 0]} isAnimationActive={false}>{valueLabel}</Bar>)}{tip(barCursor)}
    </BarChart>}
   </ResponsiveContainer>
  </div>
 )
 if (widget.kind === 'donut') return <div className={s.donut}>
  {frame}
  {(widget.legend ?? true) && <ul className={cx('legend', 'legend-col', s.legend)}>
   {rows.map((r, i) => <li key={i}><i className={s.swatch} style={{ background: color(String(r[x]), i) }}/><span className={s.lgName} title={String(r[x])}>{shortHex(String(r[x]))}</span><span className={s.lgValue}>{widget.numberFormat ? formatNumber(numeric(r[y[0]]), widget.numberFormat) : compact(numeric(r[y[0]]))}</span><span className={s.lgShare}>{total ? (numeric(r[y[0]]) / total * 100).toFixed(1) : '0.0'}%</span></li>)}
  </ul>}
 </div>
 return <>
  {frame}
  {(widget.legend ?? true) && keys.length >= 2 && <div className={cx('chart-key', s.key)}>
   {keys.map((k, i) => <span key={k} title={k}><i className={s.swatch} style={{ background: color(k, i) }}/>{shortHex(k)}</span>)}
  </div>}
 </>
}
export function AreaChart(props: ChartProps) { return <QueryChart {...props}/> }
