import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { initImport, importReducer, addLabel } from '../lib/dash/import-state'
import { ImportModal } from '../components/widgets/ImportModal'

const toggle = (s: ReturnType<typeof initImport>, key: string, remaining = 2, disabled = new Set<string>()) => importReducer(s, { type: 'toggle', key, remaining, disabled })
test('import selection toggles, ignores placed widgets and respects remaining slots', () => {
 const initial = initImport()
 expect(initial).toEqual({ tab: 'mine', search: '', chart: null, pages: 1, selected: [] })
 const one = toggle(initial, 'a')
 expect(one.selected).toEqual(['a'])
 expect(toggle(one, 'a').selected).toEqual([])
 expect(toggle(one, 'placed', 2, new Set(['placed']))).toEqual(one)
 const full = toggle(one, 'b')
 expect(toggle(full, 'c')).toEqual(full)
 expect(toggle(initial, 'a', 0)).toEqual(initial)
 expect(toggle(full, 'a', 0).selected).toEqual(['b'])
})
test('filters reset pagination and preserve selection; more adds a page', () => {
 const s = { ...toggle(initImport(), 'a'), pages: 3 }
 for (const action of [{ type: 'tab', value: 'all' }, { type: 'search', value: 'creators' }, { type: 'chart', value: 'bar' }] as const) {
  const next = importReducer(s, action)
  expect(next.pages).toBe(1)
  expect(next.selected).toEqual(['a'])
  expect(next[action.type]).toBe(action.value)
 }
 expect(importReducer(s, { type: 'more' }).pages).toBe(4)
 expect([0, 1, 2].map(addLabel)).toEqual(['Add widgets', 'Add 1 widget', 'Add 2 widgets'])
})
const list = { items: [], total: 0, loading: false, payloads: undefined, mineTotal: 0, allTotal: 12 }
const props = { dashboardTitle: 'Top creators', placed: new Set<string>(), remaining: 4, onAdd() {}, onClose() {} }
test('import dialog shows named tabs with counts and empty My widgets copy', () => {
 const html = render(<ImportModal {...props} listOverride={list}/> )
 for (const text of ['role="dialog"', 'aria-modal="true"', 'Import widgets into “Top creators”', 'My widgets', 'All widgets', 'class="tab-n">0', 'class="tab-n">12', 'You have no widgets yet.', '+ New widget', 'href="/widgets/new"', '0 selected', 'Add widgets', 'Cancel']) expect(html).toContain(text)
 expect(html).toContain('disabled=""')
})
test('import dialog shows selected count and singular or plural add labels', () => {
 for (const selected of [['a'], ['a', 'b']]) {
  const html = render(<ImportModal {...props} listOverride={list} initialState={{ ...initImport(), selected }}/> )
  expect(html).toContain(`${selected.length} selected`)
  expect(html).toContain(addLabel(selected.length))
 }
})
test('modal renders pick cards, placed state, selection and paged loading', () => {
 const items = ['a', 'b'].map(key => ({ key, name: `Widget ${key}`, chart: 'bar' as const, user: '0x' + 'ab'.repeat(20), expiresAt: 100, createdAt: 1, uses: 0 }))
 const html = render(<ImportModal {...props} placed={new Set(['b'])} initialState={{ ...initImport(), tab: 'all', selected: ['a'] }}
  listOverride={{ ...list, items, total: 20, allTotal: 20, payloads: new Map() }}/> )
 for (const text of ['Widget a', 'Widget b', 'aria-pressed="true"', 'Already on this dashboard', 'height:120px', 'Load more']) expect(html).toContain(text)
 expect(html).not.toContain('You have no widgets yet.')
 const filtered = render(<ImportModal {...props} listOverride={list} initialState={{ ...initImport(), search: 'missing' }}/> )
 expect(filtered).toContain('No widgets match these filters.')
 expect(filtered).not.toContain('You have no widgets yet.')
})
