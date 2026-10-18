import type { Widget } from './views'
import { compact } from './format'

export type StatSummary = { value: string; note?: string; share?: number; address?: string }
type Rows = { columns: string[]; rows: unknown[][] }

const grouped = (n: number, digits = 0) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits })

/** Headline number: grouped integers below a million, compact above, one decimal for fractions. */
export function formatStatValue(n: number): string {
 if (Math.abs(n) >= 1e6) return compact(n)
 return Number.isInteger(n) ? grouped(n) : grouped(n, 1)
}

/** A 0..1 share as a percentage with one decimal; a non zero share never shows as 0%. */
export function formatShare(share: number): string {
 if (share > 0 && share < 0.0005) return '<0.1%'
 return grouped(share * 100, 1) + '%'
}

const num = (v: unknown) => (v == null || v === '' ? NaN : Number(v))

/** Value, context line and optional subject address of a stat widget, read from its `value`, `total` and `address` columns. */
export function statSummary(widget: Widget, data: Rows): StatSummary | null {
 const sum = valueSummary(widget, data)
 const i = data.columns.indexOf('address')
 const address = sum && i >= 0 ? data.rows[0][i] : undefined
 return sum && typeof address === 'string' && address ? { ...sum, address } : sum
}

function valueSummary(widget: Widget, data: Rows): StatSummary | null {
 const row = data.rows[0]
 if (!row) return null
 const at = (col: string, fallback: number) => { const i = data.columns.indexOf(col); return num(row[i < 0 ? fallback : i]) }
 const value = at('value', 0)
 if (!Number.isFinite(value)) return null
 const out: StatSummary = { value: formatStatValue(value) }
 const note = widget.note
 if (!note || !data.columns.includes('total')) return out
 const total = at('total', 1)
 if (!Number.isFinite(total)) return out
 if (note.kind === 'share' && total > 0) {
  const share = value / total
  return { ...out, note: note.text.replace('{n}', formatShare(share)), share: Math.min(1, Math.max(0, share)) }
 }
 if (note.kind === 'ratio' && value > 0) return { ...out, note: note.text.replace('{n}', grouped(total / value, 1)) }
 if (note.kind === 'total') return { ...out, note: note.text.replace('{n}', grouped(total, 1)) }
 return out
}
