'use client'
import { numericColumns } from '../../lib/table'
import type { Dispatch, ReactNode } from 'react'
import type { EditorAction, EditorState } from '../../lib/dash/editor-state'
import { COLOR_TOKENS, HISTOGRAM_BINS, LIMITS, NUMBER_FORMATS, type ColorToken, type NumberFormat, type Sort, type Stacking } from '../../lib/dash/schema'
import { ToggleChip } from '../explore/Toolbar'
import e from './editor.module.css'

function Field({ label, children }: { label: string; children: ReactNode }) {
 return <label className={e.field}><span>{label}</span>{children}</label>
}
/** Segmented single choice control. Buttons carry aria-pressed, the group carries the label. */
export function Segmented<T extends string | number>({ label, value, options, onChange, full = false }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange(value: T): void; full?: boolean }) {
 return <div className={e.field}><span aria-hidden="true">{label}</span><div className={full ? `${e.seg} ${e.segFull}` : e.seg} role="group" aria-label={label}>{options.map(o => <button type="button" key={String(o.value)} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div></div>
}

export function WidgetSettings({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
 const { draft: p, result } = state
 const columns = result?.columns ?? []
 const options = columns.map(c => <option key={c} value={c}>{c}</option>)
 const mapping = (patch: Partial<typeof p.mapping>) => dispatch({ type: 'mapping', patch })
 const format = (patch: Partial<typeof p.format>) => dispatch({ type: 'format', patch })
 const counter = (patch: Partial<NonNullable<typeof p.counter>>) => dispatch({ type: 'counter', patch })
 const chart = p.chart !== 'table' && p.chart !== 'counter'
 const axes = chart && p.chart !== 'donut'
 if (!result) return <p className={e.panelHint}>Run the query to map columns.</p>
 if (p.chart === 'table') return <p className={e.panelHint}>A table shows every column of the result. Sort and limit rows in the SQL.</p>
 const series = p.chart === 'histogram' ? [] : Array.from(new Set(p.mapping.groupBy ? result.rows.map(row => String(row[result.columns.indexOf(p.mapping.groupBy!)])) : p.chart === 'donut' ? result.rows.map(row => String(row[result.columns.indexOf(p.mapping.x ?? '')])) : p.mapping.y)).slice(0, LIMITS.colors)
 return <div className={e.panelBody} aria-label="Widget settings" role="group">
  {p.chart === 'counter' && p.counter ? <>
   <section className={e.group}><h3>Data</h3>
    <div className={e.two}>
     <Field label="Value column"><select value={p.counter.column} onChange={ev => counter({ column: ev.target.value })}><option value="">None</option>{options}</select></Field>
     <Field label="Row"><input type="number" inputMode="numeric" min={0} max={LIMITS.counterRow} value={p.counter.row} onChange={ev => counter({ row: Math.max(0, Math.min(LIMITS.counterRow, Number(ev.target.value) || 0)) })}/></Field>
    </div>
   </section>
   <section className={e.group}><h3>Format</h3>
    <div className={e.two}>
     <Field label="Prefix"><input maxLength={LIMITS.affix} placeholder="$" value={p.counter.prefix} onChange={ev => counter({ prefix: ev.target.value })}/></Field>
     <Field label="Suffix"><input maxLength={LIMITS.affix} placeholder="entities" value={p.counter.suffix} onChange={ev => counter({ suffix: ev.target.value })}/></Field>
    </div>
    <Field label="Label"><input maxLength={LIMITS.counterLabel} placeholder="Shown under the number" value={p.counter.label} onChange={ev => counter({ label: ev.target.value })}/></Field>
    <div className={`${e.two} ${e.twoNarrow}`}>
     <Field label="Decimals"><select value={p.counter.decimals} onChange={ev => counter({ decimals: Number(ev.target.value) })}>{Array.from({ length: LIMITS.decimals + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select></Field>
     <div className={`${e.field} ${e.chipCell}`}><span aria-hidden="true">Display</span><ToggleChip label="Compact numbers" checked={p.counter.compact} onChange={value => counter({ compact: value })}/></div>
    </div>
   </section>
  </> : p.chart === 'histogram' ? <section className={e.group}><h3>Data</h3>
   <Field label="Value column"><select value={p.mapping.x ?? ''} onChange={ev => mapping({ x: ev.target.value || null })}><option value="">None</option>{columns.filter((_, i) => numericColumns(columns, result.rows)[i]).map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
   <Segmented label="Bins" full value={p.mapping.bins ?? 20} options={HISTOGRAM_BINS.map(n => ({ value: n as number, label: String(n) }))} onChange={bins => mapping({ bins })}/>
  </section> : chart && <section className={e.group}><h3>Data</h3>
   <Field label="X / label"><select value={p.mapping.x ?? ''} onChange={ev => mapping({ x: ev.target.value || null })}><option value="">None</option>{options}</select></Field>
   <div className={e.field} role="group" aria-label="Y / values"><span aria-hidden="true">Y / values</span>
    {p.mapping.y.map((y, i) => <div className={e.yRow} key={i}><select aria-label={`Y column ${i + 1}`} value={y} onChange={ev => mapping({ y: p.mapping.y.map((v, j) => i === j ? ev.target.value : v) })}>{options}</select><button type="button" className="btn btn-quiet" aria-label={`Remove Y column ${i + 1}`} onClick={() => mapping({ y: p.mapping.y.filter((_, j) => i !== j) })}>×</button></div>)}
    <button type="button" className={`btn btn-quiet btn-sm ${e.addBtn}`} disabled={p.mapping.y.length >= (p.chart === 'donut' || p.mapping.groupBy ? 1 : LIMITS.yColumns) || !columns.some(c => !p.mapping.y.includes(c))} onClick={() => mapping({ y: [...p.mapping.y, columns.find(c => !p.mapping.y.includes(c))!] })}>+ Add column</button>
   </div>
   {axes && <><Field label="Group by"><select value={p.mapping.groupBy ?? ''} onChange={ev => mapping({ groupBy: ev.target.value || null, y: ev.target.value ? p.mapping.y.slice(0, 1) : p.mapping.y })}><option value="">None</option>{options}</select></Field>
    {p.chart !== 'hbar' && <Segmented label="Stacking" full value={p.mapping.stacking} options={(p.chart === 'stacked-bar' ? ['stack', 'percent'] as Stacking[] : ['off', 'stack', 'percent'] as Stacking[]).map(v => ({ value: v, label: { off: 'Off', stack: 'Stack', percent: '100%' }[v] }))} onChange={stacking => mapping({ stacking })}/>}</>}
   <Segmented label="Sort" full value={p.mapping.sort} options={(['query', 'x', 'ydesc'] as Sort[]).map((v, i) => ({ value: v, label: ['Query', 'X', 'Y desc'][i] }))} onChange={sort => mapping({ sort })}/>
  </section>}
  {chart && <details className={e.group}><summary>Format</summary>
   <Field label="Number format"><select value={p.format.number} onChange={ev => format({ number: ev.target.value as NumberFormat })}>{NUMBER_FORMATS.map(v => <option key={v}>{v}</option>)}</select></Field>
   {axes && <div className={e.two}><Field label="X axis title"><input maxLength={LIMITS.axisTitle} value={p.format.xTitle ?? ''} onChange={ev => format({ xTitle: ev.target.value || null })}/></Field><Field label="Y axis title"><input maxLength={LIMITS.axisTitle} value={p.format.yTitle ?? ''} onChange={ev => format({ yTitle: ev.target.value || null })}/></Field></div>}
   <div className={e.switches}>{p.chart !== 'histogram' && <ToggleChip label="Legend" checked={p.format.legend} onChange={legend => format({ legend })}/>}<ToggleChip label="Data labels" checked={p.format.labels} onChange={labels => format({ labels })}/></div>
   {series.length > 0 && <div className={e.two}>{series.map(name => <Field key={name} label={name}><select aria-label={`Color for ${name}`} value={p.format.colors[name] ?? ''} onChange={ev => { const colors = { ...p.format.colors }; if (ev.target.value) colors[name] = ev.target.value as ColorToken; else delete colors[name]; format({ colors }) }}><option value="">Auto</option>{COLOR_TOKENS.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>)}</div>}
  </details>}
 </div>
}
