'use client'
import { numericColumns } from '../../lib/table'
import type { Dispatch } from 'react'
import type { EditorAction, EditorState } from '../../lib/dash/editor-state'
import { COLOR_TOKENS, HISTOGRAM_BINS, LIMITS, NUMBER_FORMATS, type ColorToken, type NumberFormat, type Sort, type Stacking } from '../../lib/dash/schema'
import s from './widgets.module.css'

export function WidgetSettings({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
 const { draft: p, result } = state
 const columns = result?.columns ?? []
 const options = columns.map(c => <option key={c} value={c}>{c}</option>)
 const mapping = (patch: Partial<typeof p.mapping>) => dispatch({ type: 'mapping', patch })
 const format = (patch: Partial<typeof p.format>) => dispatch({ type: 'format', patch })
 const counter = (patch: Partial<NonNullable<typeof p.counter>>) => dispatch({ type: 'counter', patch })
 const chart = p.chart !== 'table' && p.chart !== 'counter'
 const axes = chart && p.chart !== 'donut'
 return <aside className={s.settings} aria-label="Widget settings">
  {p.chart === 'counter' && p.counter ? <section><h2>Data</h2>
   <label>Value column<select value={p.counter.column} onChange={e => counter({ column: e.target.value })}><option value="">None</option>{options}</select></label>
   <label>Row<input type="number" min={0} max={LIMITS.counterRow} value={p.counter.row} onChange={e => counter({ row: Number(e.target.value) })}/></label>
   <label>Prefix<input maxLength={LIMITS.affix} value={p.counter.prefix} onChange={e => counter({ prefix: e.target.value })}/></label>
   <label>Suffix<input maxLength={LIMITS.affix} value={p.counter.suffix} onChange={e => counter({ suffix: e.target.value })}/></label>
   <label>Label<input maxLength={LIMITS.counterLabel} value={p.counter.label} onChange={e => counter({ label: e.target.value })}/></label>
   <label>Decimals<input type="number" min={0} max={LIMITS.decimals} value={p.counter.decimals} onChange={e => counter({ decimals: Number(e.target.value) })}/></label>
   <label><input type="checkbox" checked={p.counter.compact} onChange={e => counter({ compact: e.target.checked })}/>Compact</label>
  </section> : p.chart === 'histogram' ? <section><h2>Data</h2>
   <label>Value column<select value={p.mapping.x ?? ''} onChange={e => mapping({ x: e.target.value || null })}><option value="">None</option>{columns.filter((_, i) => numericColumns(columns, result?.rows ?? [])[i]).map(c => <option key={c} value={c}>{c}</option>)}</select></label>
   <label>Bins<select value={p.mapping.bins ?? 20} onChange={e => mapping({ bins: Number(e.target.value) })}>{HISTOGRAM_BINS.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
  </section> : chart && <section><h2>Data</h2>
   <label>X / label<select value={p.mapping.x ?? ''} onChange={e => mapping({ x: e.target.value || null })}><option value="">None</option>{options}</select></label>
   <fieldset><legend>Y / values</legend>{p.mapping.y.map((y, i) => <div className={s.row} key={i}><select aria-label={`Y column ${i + 1}`} value={y} onChange={e => mapping({ y: p.mapping.y.map((v, j) => i === j ? e.target.value : v) })}>{options}</select><button type="button" className="btn btn-quiet" aria-label={`Remove Y column ${i + 1}`} onClick={() => mapping({ y: p.mapping.y.filter((_, j) => i !== j) })}>×</button></div>)}
   <button type="button" className="btn btn-quiet" disabled={p.mapping.y.length >= (p.chart === 'donut' || p.mapping.groupBy ? 1 : LIMITS.yColumns) || !columns.some(c => !p.mapping.y.includes(c))} onClick={() => mapping({ y: [...p.mapping.y, columns.find(c => !p.mapping.y.includes(c))!] })}>+ Add column</button></fieldset>
   {axes && <><label>Group by<select value={p.mapping.groupBy ?? ''} onChange={e => mapping({ groupBy: e.target.value || null, y: e.target.value ? p.mapping.y.slice(0, 1) : p.mapping.y })}><option value="">None</option>{options}</select></label>
   {p.chart !== 'hbar' && <fieldset><legend>Stacking</legend><div className={s.row}>{(p.chart === 'stacked-bar' ? ['stack', 'percent'] as Stacking[] : ['off', 'stack', 'percent'] as Stacking[]).map(v => <button type="button" key={v} className="btn btn-quiet" aria-pressed={p.mapping.stacking === v} onClick={() => mapping({ stacking: v })}>{{ off: 'Off', stack: 'Stack', percent: '100%' }[v]}</button>)}</div></fieldset>}</>}
   <fieldset><legend>Sort</legend><div className={s.row}>{(['query', 'x', 'ydesc'] as Sort[]).map((v, i) => <button type="button" key={v} className="btn btn-quiet" aria-pressed={p.mapping.sort === v} onClick={() => mapping({ sort: v })}>{['Query', 'X', 'Y desc'][i]}</button>)}</div></fieldset>
  </section>}
  {chart && <details><summary>Format</summary>
   <label>Number format<select value={p.format.number} onChange={e => format({ number: e.target.value as NumberFormat })}>{NUMBER_FORMATS.map(v => <option key={v}>{v}</option>)}</select></label>
   {axes && <><label>X axis title<input maxLength={LIMITS.axisTitle} value={p.format.xTitle ?? ''} onChange={e => format({ xTitle: e.target.value || null })}/></label><label>Y axis title<input maxLength={LIMITS.axisTitle} value={p.format.yTitle ?? ''} onChange={e => format({ yTitle: e.target.value || null })}/></label></>}
   {p.chart !== 'histogram' && <label><input type="checkbox" checked={p.format.legend} onChange={e => format({ legend: e.target.checked })}/>Legend</label>}
   <label><input type="checkbox" checked={p.format.labels} onChange={e => format({ labels: e.target.checked })}/>Data labels</label>
   {p.chart !== 'histogram' && Array.from(new Set(p.mapping.groupBy && result ? result.rows.map(row => String(row[result.columns.indexOf(p.mapping.groupBy!)])) : p.chart === 'donut' && result ? result.rows.map(row => String(row[result.columns.indexOf(p.mapping.x ?? '')])) : p.mapping.y)).slice(0, LIMITS.colors).map(series => <label key={series}>{series}<select aria-label={`Color for ${series}`} value={p.format.colors[series] ?? ''} onChange={e => { const colors = { ...p.format.colors }; if (e.target.value) colors[series] = e.target.value as ColorToken; else delete colors[series]; format({ colors }) }}><option value="">Auto</option>{COLOR_TOKENS.map(c => <option key={c} value={c}>{c}</option>)}</select></label>)}
  </details>}
 </aside>
}
