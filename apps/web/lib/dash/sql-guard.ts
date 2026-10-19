const SINGLE_QUERY = 'Only one SELECT or WITH query is allowed'
const MODIFY_DATA = 'Widgets cannot modify data'
const FILE_ACCESS = 'Widgets cannot read files or URLs'
const MUTATIONS = /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|DROP|ALTER|ATTACH|DETACH|COPY|EXPORT|IMPORT|INSTALL|LOAD|SET|RESET|PRAGMA|CALL|CHECKPOINT|VACUUM|TRUNCATE|USE|BEGIN|COMMIT|ROLLBACK)\b/i
const FILE_IDENTIFIERS = /\b(?:(?:read_|parquet_|iceberg_|delta_|sqlite_|postgres_|mysql_)[a-z0-9_$]*|glob|getenv|query_table|query)\b/i
const FILE_LITERAL = /:\/\/|^[\/~]|\.(?:parquet|csv|tsv|json|jsonl|ndjson|txt|db|duckdb)$/i

export function checkWidgetSql(sql: string): string | null {
  const tokens: string[] = []
  const literals: string[] = []
  let i = 0
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      i += 2
      while (i < sql.length && sql[i] !== '\n' && sql[i] !== '\r') i++
      tokens.push(' ')
    } else if (sql.startsWith('/*', i)) {
      i += 2
      let depth = 1
      while (i < sql.length && depth > 0) {
        if (sql.startsWith('/*', i)) { depth++; i += 2 }
        else if (sql.startsWith('*/', i)) { depth--; i += 2 }
        else i++
      }
      if (depth > 0) return SINGLE_QUERY
      tokens.push(' ')
    } else if (/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(sql.slice(i))) {
      return 'Widgets cannot use dollar quoted strings'
    } else if ((sql[i] === 'E' || sql[i] === 'e') && sql[i + 1] === "'" &&
      (i === 0 || !/[A-Za-z0-9_$]/.test(sql[i - 1]))) {
      return 'Widgets cannot use escape string literals'
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i++]
      let value = ''
      let closed = false
      while (i < sql.length) {
        if (sql[i] === quote) {
          i++
          if (sql[i] === quote) { value += quote; i++ }
          else { closed = true; break }
        } else value += sql[i++]
      }
      if (!closed) return SINGLE_QUERY
      if (quote === '"') {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) return 'Widgets require simple quoted identifiers'
        if (FILE_IDENTIFIERS.test(value.toLowerCase())) return FILE_ACCESS
      } else literals.push(value)
      tokens.push(' ? ')
    } else tokens.push(sql[i++])
  }

  const text = tokens.join('').trim().replace(/;$/, '').trim()
  if (text.includes(';') || !/^(?:SELECT|WITH)\b/i.test(text)) return SINGLE_QUERY
  if (MUTATIONS.test(text)) return MODIFY_DATA
  if (FILE_IDENTIFIERS.test(text) || literals.some(value => FILE_LITERAL.test(value))) return FILE_ACCESS
  return null
}
