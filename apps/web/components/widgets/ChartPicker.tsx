'use client'
import { CHART_TYPES, type ChartType } from '../../lib/dash/schema'
import { ChartIcon } from './ChartIcon'
import e from './editor.module.css'

export const CHART_LABELS: Record<ChartType, string> = { table: 'Table', counter: 'Counter', bar: 'Bar', 'stacked-bar': 'Stacked bar', histogram: 'Histogram', hbar: 'H bar', line: 'Line', area: 'Area', donut: 'Donut' }
export function pickerIndex(key: string, index: number): number {
 if (key === 'Home') return 0
 if (key === 'End') return CHART_TYPES.length - 1
 if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % CHART_TYPES.length
 if (key === 'ArrowLeft' || key === 'ArrowUp') return (index + CHART_TYPES.length - 1) % CHART_TYPES.length
 return index
}
export function ChartPicker({ value, onChange }: { value: ChartType; onChange(c: ChartType): void }) {
 return <div role="radiogroup" aria-label="Chart type" className={e.picker}>
  {CHART_TYPES.map((type, index) => <button key={type} type="button" role="radio" aria-checked={value === type} tabIndex={value === type ? 0 : -1} onClick={() => onChange(type)} onKeyDown={event => {
   if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
   event.preventDefault()
   const next = pickerIndex(event.key, index)
   onChange(CHART_TYPES[next])
   ;(event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus()
  }}><ChartIcon type={type} size={20}/><span>{CHART_LABELS[type]}</span></button>)}
 </div>
}
