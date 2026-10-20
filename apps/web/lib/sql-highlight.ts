// Small SQL tokenizer for read only code blocks. Classes map to the --sx-* theme tokens.
export type SqlToken = { text: string; cls?: 'sx-kw' | 'sx-fn' | 'sx-str' | 'sx-num' | 'sx-cm' | 'sx-op' }

const KEYWORDS = new Set(('select from where join left right inner outer full cross on group by order as with case when then else end limit offset over ' +
  'partition desc asc and or distinct is not null filter having union all in between like ilike exists true false interval cast ' +
  'rows range preceding following unbounded current row nulls first last qualify window using natural lateral values recursive').split(' '))
const TYPES = new Set('bigint integer int double varchar text boolean ubigint hugeint decimal date timestamp float real smallint tinyint'.split(' '))

const PATTERN = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|("(?:[^"]|"")*")|(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(::|<=|>=|<>|!=|\|\||[-+*/%=<>])/gi

export function highlightSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = []
  let last = 0
  for (const m of sql.matchAll(PATTERN)) {
    const at = m.index ?? 0
    if (at > last) tokens.push({ text: sql.slice(last, at) })
    const [text, comment, str, quoted, num, word, op] = m
    if (comment) tokens.push({ text, cls: 'sx-cm' })
    else if (str) tokens.push({ text, cls: 'sx-str' })
    else if (quoted) tokens.push({ text })
    else if (num) tokens.push({ text, cls: 'sx-num' })
    else if (word) {
      const lower = word.toLowerCase()
      const next = sql.slice(at + word.length).match(/^\s*\(/)
      tokens.push({ text, cls: KEYWORDS.has(lower) || TYPES.has(lower) ? 'sx-kw' : next ? 'sx-fn' : undefined })
    } else if (op) tokens.push({ text, cls: 'sx-op' })
    last = at + text.length
  }
  if (last < sql.length) tokens.push({ text: sql.slice(last) })
  return tokens
}
