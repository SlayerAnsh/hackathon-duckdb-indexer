import type { View, Widget } from '../../lib/views'

export type Snippet = { id: string; title: string; subtitle: string; sql: string; preview: string; notInArkivQuery?: string }
export type SnippetGroup = { id: string; title: string; snippets: Snippet[] }

const KIND_LABEL: Record<Widget['kind'], string> = { line: 'Line chart', stat: 'Single figure', area: 'Area chart', bar: 'Bar chart', 'stacked-bar': 'Stacked bar chart', donut: 'Donut chart', table: 'Table', histogram: 'Histogram' }
const PREVIEW_MAX = 120

/** One line SQL preview: whitespace collapsed, truncated with an ellipsis. */
export function sqlPreview(sql: string): string {
 const line = sql.replace(/\s+/g, ' ').trim()
 return line.length <= PREVIEW_MAX ? line : line.slice(0, PREVIEW_MAX - 1).trimEnd() + '…'
}

const snippet = (id: string, title: string, subtitle: string, sql: string, notInArkivQuery?: string): Snippet => ({ id, title, subtitle, sql, preview: sqlPreview(sql), notInArkivQuery })

/** Featured default query first, then one group per view holding every widget query. */
export function buildSnippets(views: View[], defaultSql: string): SnippetGroup[] {
 return [
  { id: 'featured', title: 'Featured', snippets: [snippet('featured/default', 'Most placed widgets', 'Widgets ranked by dashboard placements, including unused widgets', defaultSql, 'GROUP BY + JOIN')] },
  ...views.map(view => ({ id: view.id, title: view.title, snippets: view.widgets.map(w => snippet(`${view.id}/${w.id}`, w.title, w.subtitle ?? KIND_LABEL[w.kind], w.sql, w.notInArkivQuery)) })),
 ]
}

export const snippetCount = (groups: SnippetGroup[]): number => groups.reduce((n, g) => n + g.snippets.length, 0)

/** Keeps snippets whose title or SQL contains every whitespace separated term (case insensitive). Empty groups are dropped. */
export function filterSnippets(groups: SnippetGroup[], query: string): SnippetGroup[] {
 const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
 if (!terms.length) return groups
 return groups
  .map(g => ({ ...g, snippets: g.snippets.filter(s => { const text = `${s.title}\n${s.sql}`.toLowerCase(); return terms.every(t => text.includes(t)) }) }))
  .filter(g => g.snippets.length > 0)
}

/** Id of the snippet whose SQL equals `sql` (ignoring surrounding whitespace), or null. */
export function matchSnippet(groups: SnippetGroup[], sql: string): string | null {
 const wanted = sql.trim()
 for (const g of groups) for (const s of g.snippets) if (s.sql.trim() === wanted) return s.id
 return null
}

const tokens = (sql: string) => new Set(sql.toLowerCase().match(/[a-z_][a-z0-9_]*|\d+/g) ?? [])
/**
 * Snippet the editor still shows. An exact match wins (also for a different snippet). Otherwise the last
 * picked snippet stays, marked edited, while at least half of its words remain; once the text is mostly
 * replaced the editor holds a custom query and this returns null.
 */
export function activeSnippet(groups: SnippetGroup[], activeId: string | null, sql: string): string | null {
 const exact = matchSnippet(groups, sql)
 if (exact || !activeId) return exact
 const picked = groups.flatMap(g => g.snippets).find(s => s.id === activeId)
 if (!picked) return null
 const want = tokens(picked.sql), have = tokens(sql)
 if (!want.size || !have.size) return null
 let kept = 0
 for (const t of want) if (have.has(t)) kept++
 return kept / want.size >= 0.5 ? activeId : null
}
