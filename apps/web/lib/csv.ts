export function cellText(value: unknown): string {
 if (value == null) return ''
 if (typeof value === 'object') return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v)
 return String(value)
}
export function toCsv(columns: string[], rows: unknown[][]): string {
 const quote = (value: unknown) => { const text = cellText(value); return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text }
 return [columns, ...rows].map(row => row.map(quote).join(',')).join('\r\n')
}
