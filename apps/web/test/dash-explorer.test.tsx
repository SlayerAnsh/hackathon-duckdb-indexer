import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { explorerQuery, explorerReducer, initExplorer, mergeExplorerItems } from '../lib/dash/explorer-state'
import { ExplorerView } from '../components/widgets/ExplorerGrid'
import type { PendingWrite } from '../lib/dash/pending'

const address = '0x' + 'a'.repeat(40)
test('explorer filters reset pagination, more increments, clear preserves mine', () => {
 const expanded = explorerReducer(initExplorer(), { type: 'more' })
 expect(expanded.pages).toBe(2)
 for (const action of [{ type: 'search', value: 'top' }, { type: 'chart', value: 'bar' }, { type: 'sort', value: 'used' }, { type: 'mine', value: true }] as const) {
  expect(explorerReducer(expanded, action).pages).toBe(1)
 }
 expect(explorerReducer({ ...expanded, search: 'top', chart: 'bar', sort: 'used', mine: true }, { type: 'clear' })).toEqual({ ...initExplorer(), mine: true })
})
test('explorer query preserves raw input and scopes mine only with an address', () => {
 const state = { ...explorerReducer(initExplorer(), { type: 'more' }), search: "x' OR %_", mine: true }
 expect(explorerQuery(state, address)).toEqual({ search: "x' OR %_", chart: null, sort: 'newest', user: address, limit: 24, offset: 0 })
 expect(explorerQuery(state, undefined).user).toBeNull()
 expect(explorerQuery({ ...state, mine: false }, address).user).toBeNull()
})
test('explorer header, empty copy and login dependent controls', () => {
 const render = (liveCount: number, total: number, loggedIn = false) => renderToStaticMarkup(<ExplorerView state={initExplorer()} dispatch={() => {}} liveCount={liveCount} total={total} loggedIn={loggedIn} loading={false}/> )
 const empty = render(0, 0)
 for (const text of ['No widgets yet', 'href="/widgets/new"', 'New widget', 'Open playground', 'href="/playground"', 'role="status"']) expect(empty).toContain(text)
 expect(empty).not.toContain(' live<')
 expect(empty).not.toContain('quiet-chip')
 expect(empty).not.toContain('<h1')
 expect(empty).not.toContain('Mine only')
 const filtered = render(214, 0, true)
 expect(filtered).toContain('No matches')
 expect(filtered).toContain('Nothing matches these filters.')
 expect(filtered).toContain('Clear filters')
 expect(filtered).toContain('Mine only')
 expect(filtered).toContain('type="checkbox"')
 expect(render(214, 12)).toContain('<b>12</b> widgets')
 expect(render(214, 0)).not.toContain('0 widgets')
 const loading = renderToStaticMarkup(<ExplorerView state={initExplorer()} dispatch={() => {}} liveCount={null} total={null} loggedIn={false} loading/>)
 expect(loading).toContain('data-skeleton="true"')
 expect(loading).not.toContain('No widgets yet')
})
test('pending widgets lead newest results, respect filters and do not duplicate indexed keys', () => {
 const pending: PendingWrite[] = [{ key: 'new', kind: 'widget', op: 'upsert', afterBlock: 10, at: 1, fields: { name: 'Top owners', chart: 'bar', user: address } }]
 const state = initExplorer()
 const items = mergeExplorerItems([], pending, state, address)
 expect(items.map(item => item.key)).toEqual(['new'])
 expect(mergeExplorerItems(items, pending, state, address)).toHaveLength(1)
 expect(mergeExplorerItems([], pending, { ...state, sort: 'used' }, address)).toEqual([])
 expect(mergeExplorerItems([], pending, { ...state, search: '%' }, address)).toEqual([])
 expect(mergeExplorerItems([], pending, { ...state, chart: 'donut' }, address)).toEqual([])
 expect(mergeExplorerItems([], pending, { ...state, mine: true }, '0x' + 'b'.repeat(40))).toEqual([])
})
