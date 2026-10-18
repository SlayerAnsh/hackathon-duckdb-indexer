import { cellText } from './csv'
import { shortHex } from './format'

const isNum = (v: unknown): v is number | bigint => typeof v === 'number' || typeof v === 'bigint'

/** Per column: true when it has values and every non null value is a number or bigint. */
export function numericColumns(columns: string[], rows: unknown[][]): boolean[] {
 return columns.map((_, j) => {
  let seen = false
  for (const row of rows) { const v = row[j]; if (v == null) continue; if (!isNum(v)) return false; seen = true }
  return seen
 })
}

const rawInteger = (column: string, v: number | bigint) => /(_at|block)$/i.test(column) || (typeof v === 'bigint' ? v > BigInt(1e9) || v < BigInt(-1e9) : Math.abs(v) > 1e9)

/** Display text of a query cell. Display only: titles and CSV keep the raw value. */
export function formatCell(column: string, v: unknown): string {
 if (v == null) return ''
 if (typeof v === 'number' && !Number.isInteger(v)) {
  if (!Number.isFinite(v)) return String(v)
  const r = Math.round(v * 100) / 100
  if (rawInteger(column, v)) return String(r)
  return (r === 0 ? 0 : r).toLocaleString('en-US', { maximumFractionDigits: 2 })
 }
 if (isNum(v)) return rawInteger(column, v) ? String(v) : v.toLocaleString('en-US')
 return shortHex(cellText(v))
}
