import type { Widget } from '../../lib/views'

export const COLUMNS = 12
export type CardSpan = { lg: number; md: number; sm: number }

/** Desktop span on a 12 column grid: stats are small, charts take half, tables and wide charts the full row. */
export function baseSpan(widget: Widget): number {
 if (widget.kind === 'table' || widget.span === 3) return COLUMNS
 if (widget.kind === 'stat') return 4
 return 6
}

/** Packs spans into rows and widens cards so that every row fills all columns. */
export function packRow(spans: number[], columns = COLUMNS): number[] {
 const out: number[] = []
 let row: number[] = []
 const close = () => {
  if (!row.length) return
  const used = row.reduce((a, b) => a + b, 0)
  const even = columns / row.length
  if (used < columns && Number.isInteger(even) && row.every(s => s <= even)) row = row.map(() => even)
  else if (used < columns) row[row.length - 1] += columns - used
  out.push(...row)
  row = []
 }
 for (const span of spans) {
  const s = Math.min(columns, Math.max(1, span))
  if (row.reduce((a, b) => a + b, 0) + s > columns) close()
  row.push(s)
 }
 close()
 return out
}

/** Spans for desktop (lg), tablet (md) and phone (sm). Stats sit three to a row on tablet and two on phones. */
export function cardSpans(widgets: Widget[]): CardSpan[] {
 const base = widgets.map(baseSpan)
 const lg = packRow(base)
 const md = packRow(widgets.map((w, i) => (base[i] === COLUMNS ? COLUMNS : w.kind === 'stat' ? 4 : 6)))
 const sm = packRow(widgets.map(w => (w.kind === 'stat' ? 6 : COLUMNS)))
 return widgets.map((_, i) => ({ lg: lg[i], md: md[i], sm: sm[i] }))
}
