import { test, expect } from 'bun:test'
import { encodeSqlHash, decodeSqlHash } from '../lib/hash-state'

test('encodeSqlHash round trips unicode and is url safe', () => {
 for (const sql of ["SELECT 'हेलो 🌍'", 'SELECT 1', "SELECT '??>>~~' -- ü", '']) {
  const encoded = encodeSqlHash(sql)
  expect(encoded).not.toContain('#')
  expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/)
  expect(decodeSqlHash(encoded)).toBe(sql === '' ? null : sql)
 }
})
test('decodeSqlHash tolerates a leading hash and rejects garbage', () => {
 expect(decodeSqlHash('#' + encodeSqlHash('SELECT 2'))).toBe('SELECT 2')
 expect(decodeSqlHash('%%%')).toBeNull()
 expect(decodeSqlHash('')).toBeNull()
})

import { activeSnippet, buildSnippets, filterSnippets, matchSnippet, sqlPreview, snippetCount } from '../components/playground/snippets'
import { parseQueryError, queryErrorTitle } from '../lib/query-error'
import { HistoryList } from '../components/playground/HistoryList'
import { VIEWS, DEFAULT_SQL } from '../lib/views'

test('buildSnippets puts the default query first, then one group per view with every widget', () => {
 const groups = buildSnippets(VIEWS, DEFAULT_SQL)
 expect(groups[0].snippets).toHaveLength(1)
 expect(groups[0].snippets[0].title).toBe('Most placed widgets')
 expect(groups[0].snippets[0].sql).toBe(DEFAULT_SQL)
 expect(groups.slice(1).map(g => g.title)).toEqual(VIEWS.map(v => v.title))
 expect(snippetCount(groups)).toBe(1 + VIEWS.reduce((n, v) => n + v.widgets.length, 0))
 const ids = groups.flatMap(g => g.snippets.map(s => s.id))
 expect(new Set(ids).size).toBe(ids.length)
 for (const s of groups.flatMap(g => g.snippets)) { expect(s.subtitle.length).toBeGreaterThan(0); expect(s.preview).not.toContain('\n') }
 const creations = groups.flatMap(g => g.snippets).find(s => s.id === 'overview/creations')!
 expect(creations.subtitle).toBe('Last 24 hours · live entities only')
 expect(creations.notInArkivQuery).toBe('GROUP BY')
 expect(groups.flatMap(g => g.snippets).find(s => s.id === 'overview/live')!.subtitle).toBe('Single figure')
})
test('sqlPreview collapses whitespace into one line and truncates', () => {
 expect(sqlPreview('SELECT a,\n  b\tFROM t')).toBe('SELECT a, b FROM t')
 const long = sqlPreview('SELECT ' + 'x,'.repeat(200))
 expect(long.length).toBeLessThanOrEqual(120); expect(long.endsWith('…')).toBe(true)
})
test('filterSnippets matches title or SQL, case insensitive, all terms, and drops empty groups', () => {
 const groups = buildSnippets(VIEWS, DEFAULT_SQL)
 expect(filterSnippets(groups, '')).toBe(groups)
 expect(filterSnippets(groups, '   ')).toBe(groups)
 const median = filterSnippets(groups, 'MEDIAN')
 expect(median.map(g => g.id)).toEqual(['expiry'])
 expect(median[0].snippets.map(s => s.id)).toEqual(['expiry/median'])
 const bySql = filterSnippets(groups, 'row_number')
 expect(bySql.flatMap(g => g.snippets).map(s => s.id)).toEqual(['overview/types'])
 const both = filterSnippets(groups, 'top value')
 expect(both.flatMap(g => g.snippets).map(s => s.id)).toEqual(['attributes/status', 'attributes/priority'])
 expect(filterSnippets(groups, 'no such snippet anywhere')).toEqual([])
})
test('matchSnippet finds a snippet by SQL ignoring surrounding whitespace', () => {
 const groups = buildSnippets(VIEWS, DEFAULT_SQL)
 expect(matchSnippet(groups, '\n' + DEFAULT_SQL + '  ')).toBe('featured/default')
 expect(matchSnippet(groups, VIEWS[1].widgets.find(w => w.id === 'horizon')!.sql)).toBe('expiry/horizon')
 expect(matchSnippet(groups, 'SELECT 42')).toBeNull()
})

test('sidebar renders grouped cards, marks the active snippet and pins schema help', async () => {
 const { renderToStaticMarkup } = await import('react-dom/server')
 const { SnippetSidebar } = await import('../components/playground/SnippetSidebar')
 const groups = buildSnippets(VIEWS, DEFAULT_SQL)
 const noop = () => {}
 const html = renderToStaticMarkup(<SnippetSidebar id="x" groups={groups} activeId="expiry/median" edited schema={{ entities: ['key', 'owner'], attributes: ['name'] }} open={false} onClose={noop} onPick={noop} onInsert={noop}/>)
 expect(html.match(/aria-current="true"/g)).toHaveLength(1)
 expect(html).toContain('edited')
 for (const v of VIEWS) expect(html).toContain(v.title)
 expect(html).toContain('Insert column entities.owner')
 expect(html).toContain('Insert column attributes.name')
})
test('playground renders before the index loads', async () => {
 const { renderToStaticMarkup } = await import('react-dom/server')
 const { Playground } = await import('../components/playground/Playground')
 const html = renderToStaticMarkup(<Playground db={null} rpcUrl="http://rpc"/>)
 expect(html).toContain('SQL playground'); expect(html).toContain('Loading the index into your browser')
 expect(html).toContain('Most placed widgets')
})

test('parseQueryError turns DuckDB JSON errors into a type and a message with real newlines', () => {
 const raw = '{"exception_type":"Parser","exception_message":"syntax error at or near \\"selec\\"\\n\\nLINE 1: selec count(* from entities\\n        ^","error_subtype":"SYNTAX_ERROR"}'
 const parsed = parseQueryError(raw)
 expect(parsed.type).toBe('Parser')
 expect(parsed.message).toBe('syntax error at or near "selec"\n\nLINE 1: selec count(* from entities\n        ^')
 expect(parsed.message).not.toContain('\\n')
 expect(queryErrorTitle(parsed)).toBe('Parser error')
 expect(parseQueryError('Error: ' + raw).type).toBe('Parser')
 expect(parseQueryError('Catalog Error: Table x does not exist')).toEqual({ message: 'Catalog Error: Table x does not exist' })
 expect(parseQueryError('{not json')).toEqual({ message: '{not json' })
 expect(queryErrorTitle({ message: 'x' })).toBe('Query failed')
})
test('activeSnippet keeps an edited snippet but calls fully replaced text a custom query', () => {
 const groups = buildSnippets(VIEWS, DEFAULT_SQL)
 expect(activeSnippet(groups, 'featured/default', DEFAULT_SQL)).toBe('featured/default')
 expect(activeSnippet(groups, 'featured/default', DEFAULT_SQL + '\n-- my note')).toBe('featured/default')
 expect(activeSnippet(groups, 'featured/default', 'selec count(* from entities')).toBeNull()
 expect(activeSnippet(groups, 'featured/default', '')).toBeNull()
 const horizon = VIEWS[1].widgets.find(w => w.id === 'horizon')!.sql
 expect(activeSnippet(groups, 'featured/default', horizon)).toBe('expiry/horizon')
 expect(activeSnippet(groups, null, 'SELECT 42')).toBeNull()
})
test('history lists failed runs with their error', async () => {
 const { renderToStaticMarkup } = await import('react-dom/server')
 const html = renderToStaticMarkup(<HistoryList entries={[{ sql: 'selec 1', ms: 3, rows: 0, error: 'Parser error' }, { sql: 'SELECT 1', ms: 2, rows: 1 }]} onSelect={() => {}}/>)
 expect(html).toContain('Parser error'); expect(html).toContain('1 row'); expect(html).not.toContain('0 rows')
})
