import type { ChartType } from '../../lib/dash/schema'

export function ChartIcon({ type, size = 16 }: { type: ChartType; size?: number }) {
 const shapes = {
  table: <><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 6h12M2 10h12M6 2v12M10 2v12"/></>,
  counter: <text x="1" y="11" fill="currentColor" stroke="none" fontSize="8">123</text>,
  bar: <path d="M3 14V8h2v6M7 14V3h2v11M11 14V6h2v8"/>,
  hbar: <path d="M2 3h8v2H2M2 7h12v2H2M2 11h6v2H2"/>,
  line: <path d="m2 12 4-6 4 3 4-6"/>,
  area: <path d="m2 12 4-6 4 3 4-6v11H2Z" fill="currentColor" fillOpacity=".2"/>,
  donut: <path d="M8 2a6 6 0 1 0 6 6h-3a3 3 0 1 1-3-3Z"/>,
 }
 return <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{shapes[type]}</svg>
}
