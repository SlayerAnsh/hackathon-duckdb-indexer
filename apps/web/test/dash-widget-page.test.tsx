import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { widgetLoadState, WidgetPageBody, widgetPageMode, ViewerHeader, MissingWidget, StoredWidgetPreview } from '../components/widgets/WidgetPage'
import { pickerRows, PickerList } from '../components/widgets/AddToDashboardPicker'
import { emptyWidget } from '../lib/dash/schema'
import type { WidgetEntity } from '../lib/dash/entities'
import type { PendingWrite } from '../lib/dash/pending'
import { playgroundHref } from '../components/dash/WidgetCard'
import { checkWidgetSql } from '../lib/dash/sql-guard'
const K = '0x' + 'ab'.repeat(32), D = '0x' + 'cd'.repeat(32), U = '0x' + 'ef'.repeat(20)
const widget = { user: U, widget: { ...emptyWidget(), name: 'Count', sql: 'SELECT count(*) FROM entities' } } as WidgetEntity

test('widget page mode handles loading, missing, owner and public viewers', () => {
 expect(widgetPageMode({ loaded: false, widget: null })).toBe('loading')
 expect(widgetPageMode({ loaded: true, widget: null })).toBe('missing')
 expect(widgetPageMode({ loaded: true, widget, address: U.toUpperCase() })).toBe('owner')
 expect(widgetPageMode({ loaded: true, widget })).toBe('viewer')
 expect(widgetPageMode({ loaded: true, widget, address: 'other' })).toBe('viewer')
})
test('picker merges pending dashboards and links without duplicating SQL rows', () => {
 const pending: PendingWrite[] = [
  { key: D, kind: 'dashboard', op: 'upsert', afterBlock: 1, at: 1, fields: { title: 'New' } },
  { key: 'link', kind: 'link', op: 'upsert', afterBlock: 1, at: 1, fields: { dashboard: D, widget: K } },
 ]
 expect(pickerRows([[K, 'Existing', BigInt(4), true, 1]], pending, K)).toEqual([
  { key: K, title: 'Existing', widgets: 4, added: true }, { key: D, title: 'New', widgets: 0, added: true },
 ])
 expect(pickerRows([[D, 'Indexed', 1, false, 2]], pending, K)).toHaveLength(1)
 expect(pickerRows([], [{ ...pending[1], fields: { dashboard: D, widget: 'other' } }, pending[0]], K)[0].added).toBe(false)
})
test('picker row states and new dashboard action', () => {
 const rows = ['already', 'adding', 'done'].map(key => ({ key, title: key, widgets: 4, added: key === 'already' }))
 const html = render(<PickerList rows={rows} phase={{ adding: 'adding', done: 'done' }} onPick={() => {}} onNew={() => {}}/>)
 for (const copy of ['Already added', 'Adding…', 'Added ✓', 'href="/d/done"', 'View', '+ New dashboard']) expect(html).toContain(copy)
})
test('viewer header links to the playground and missing copy links to browse', () => {
 const html = render(<ViewerHeader name="Count" sql={widget.widget.sql} onAdd={() => {}}/>)
 expect(html).toContain('+ Add to my dashboard')
 expect(html).toContain('Open in playground')
 expect(html).toContain(`href="${playgroundHref(widget.widget.sql)}"`)
 const missing = render(<MissingWidget/>)
 expect(missing).toContain('This widget has expired. Its query is no longer on Arkiv.')
 expect(missing).toContain('href="/widgets"')
 expect(missing).toContain('Browse widgets')
})
test('unsafe stored SQL never mounts the query runner', () => {
 let calls = 0
 const payload = { ...widget.widget, sql: 'DELETE FROM entities' }
 const html = render(<StoredWidgetPreview payload={payload} version={0} run={() => { calls++; return { loading: false } }}/>)
 expect(html).toContain('class="error"')
 expect(html).toContain(checkWidgetSql(payload.sql)!)
 expect(calls).toBe(0)
})

test('widget loading waits for auth and retries pending writes and transient errors', () => {
 const input = { authStatus: 'anonymous', widget: null, pending: false, attempts: 0, loadError: false }
 expect(widgetLoadState({ ...input, authStatus: 'loading', widget })).toBe('auth')
 expect(widgetLoadState({ ...input, widget, pending: true, loadError: true })).toBe('ready')
 expect(widgetLoadState({ ...input, pending: true, attempts: 9 })).toBe('syncing')
 expect(widgetLoadState({ ...input, pending: true, attempts: 10 })).toBe('missing')
 expect(widgetLoadState({ ...input, loadError: true, attempts: 2 })).toBe('syncing')
 expect(widgetLoadState({ ...input, loadError: true, attempts: 3 })).toBe('error')
 expect(widgetLoadState(input)).toBe('missing')
 expect(widgetPageMode({ loaded: true, widget, authStatus: 'loading' })).toBe('loading')
})
test('syncing widget page body shows the pending name without expired copy', () => {
 const html = render(<WidgetPageBody state="syncing" name="Count"/>)
 expect(html).toContain('Count')
 expect(html).toContain('Syncing')
 expect(html).toContain('state-disk')
 expect(html).not.toContain('expired')
})
