import { expect, test } from 'bun:test'
import type { DashboardEntity, WidgetEntity } from '../lib/dash/entities'
import type { Slot } from '../lib/dash/slots'
import { emptyWidget } from '../lib/dash/schema'
import { announcement, draftFromDashboard, isDirty, onDashboard, organizeReducer, remainingSlots, toOrganizeInput, type ImportCandidate } from '../lib/dash/organize-state'

const dashboard = { user: 'owner', title: 'Top creators' } as DashboardEntity
const widget = { owner: 'holder', user: 'other', chart: 'hbar', expiresAt: 123, widget: { ...emptyWidget(), lifetimeDays: 7 } } as WidgetEntity
const slots: Slot[] = [
 { id: 'ignored', linkKey: 'l1', widgetKey: 'w1', name: 'Stored name', size: 'xl', status: 'live', widget },
 { id: 'l2', linkKey: 'l2', widgetKey: 'w2', name: 'Gone', size: 'xs', status: 'expired', widget: null },
]
const initial = () => draftFromDashboard(dashboard, slots)
const candidate = (key: string, chart: ImportCandidate['chart'] = 'counter'): ImportCandidate => ({ key, name: key, chart, owner: 'holder', user: 'owner', expiresAt: 456, lifetimeDays: 30 })

test('draft preserves slot order, stored names, link ids and unavailable widget metadata', () => {
 expect(initial()).toEqual({ title: 'Top creators', items: [
  { id: 'l1', link: 'l1', widget: 'w1', name: 'Stored name', chart: 'hbar', size: 'xl', imported: true, owner: 'holder', expiresAt: 123, lifetimeDays: 7, expired: false, flash: false },
  { id: 'l2', link: 'l2', widget: 'w2', name: 'Gone', chart: null, size: 'xs', imported: false, owner: null, expiresAt: null, lifetimeDays: null, expired: true, flash: false },
 ] })
 expect(draftFromDashboard(dashboard, [{ ...slots[0]!, widget: { ...widget, user: 'owner' } }]).items[0]!.imported).toBe(false)
 expect(draftFromDashboard(dashboard, [{ ...slots[1]!, status: 'loading' }]).items[0]!.expired).toBe(false)
})

test('move follows arrayMove semantics; resize and remove target ids without mutating the original', () => {
 const original = initial()
 const moved = organizeReducer(original, { type: 'move', from: 0, to: 1 })
 expect(moved.items.map(item => item.id)).toEqual(['l2', 'l1'])
 expect(organizeReducer(original, { type: 'move', from: -1, to: 0 }).items).toEqual(moved.items)
 const resized = organizeReducer(moved, { type: 'resize', id: 'l1', size: 'sm' })
 expect(resized.items.map(item => item.size)).toEqual(['xs', 'sm'])
 expect(organizeReducer(resized, { type: 'remove', id: 'l2' }).items.map(item => item.id)).toEqual(['l1'])
 expect(original).toEqual(initial())
})

test('import skips placed and repeated keys, assigns metadata and defaults, and clears flashes', () => {
 const draft = organizeReducer(initial(), { type: 'import', owner: 'owner', widgets: [candidate('w1'), candidate('w3'), candidate('w3'), { ...candidate('w4', 'donut'), user: 'other', lifetimeDays: null }, candidate('w5', 'line')] })
 expect(draft.items.slice(2)).toEqual([
  { id: 'new:w3', link: null, widget: 'w3', name: 'w3', chart: 'counter', size: 'xs', imported: false, owner: 'holder', expiresAt: 456, lifetimeDays: 30, expired: false, flash: true },
  { id: 'new:w4', link: null, widget: 'w4', name: 'w4', chart: 'donut', size: 'sm', imported: true, owner: 'holder', expiresAt: 456, lifetimeDays: null, expired: false, flash: true },
  { id: 'new:w5', link: null, widget: 'w5', name: 'w5', chart: 'line', size: 'md', imported: false, owner: 'holder', expiresAt: 456, lifetimeDays: 30, expired: false, flash: true },
 ])
 expect(onDashboard(draft)).toEqual(new Set(['w1', 'w2', 'w3', 'w4', 'w5']))
 expect(remainingSlots(draft)).toBe(43)
 expect(organizeReducer(draft, { type: 'clearFlash' }).items.every(item => !item.flash)).toBe(true)
 expect(draft.items[2]!.flash).toBe(true)
})

test('import stops at 48 items, including existing expired slots', () => {
 const full = organizeReducer(initial(), { type: 'import', owner: 'owner', widgets: Array.from({ length: 60 }, (_, i) => candidate(`extra${i}`)) })
 expect(full.items).toHaveLength(48)
 expect(full.items.at(-1)!.widget).toBe('extra45')
 expect(remainingSlots(full)).toBe(0)
 expect(organizeReducer(full, { type: 'import', owner: 'owner', widgets: [candidate('overflow')] })).toEqual(full)
})

test('dirty state tracks persisted edits and becomes clean after moving back', () => {
 const original = initial()
 expect(isDirty(initial(), original)).toBe(false)
 const moved = organizeReducer(original, { type: 'move', from: 0, to: 1 })
 expect(isDirty(moved, original)).toBe(true)
 expect(isDirty(organizeReducer(moved, { type: 'move', from: 1, to: 0 }), original)).toBe(false)
 for (const changed of [
  organizeReducer(original, { type: 'resize', id: 'l1', size: 'md' }),
  organizeReducer(original, { type: 'title', value: 'New title' }),
  organizeReducer(original, { type: 'import', owner: 'owner', widgets: [candidate('new')] }),
  organizeReducer(original, { type: 'remove', id: 'l2' }),
 ]) expect(isDirty(changed, original)).toBe(true)
 expect(isDirty({ ...original, items: original.items.map(item => ({ ...item, flash: true })) }, original)).toBe(false)
})

test('save input includes ordered links and trimmed changed title only', () => {
 const original = initial()
 expect(toOrganizeInput(original, original)).toEqual({ items: [{ link: 'l1', widget: 'w1', size: 'xl' }, { link: 'l2', widget: 'w2', size: 'xs' }] })
 const imported = organizeReducer(original, { type: 'import', owner: 'owner', widgets: [candidate('new')] })
 const moved = organizeReducer(imported, { type: 'move', from: 2, to: 0 })
 expect(toOrganizeInput({ ...moved, title: '  Renamed  ' }, original)).toEqual({ title: 'Renamed', items: [{ link: null, widget: 'new', size: 'xs' }, { link: 'l1', widget: 'w1', size: 'xl' }, { link: 'l2', widget: 'w2', size: 'xs' }] })
})

test('drag announcements match the UI copy exactly', () => {
 expect(announcement('start', 'Top 10 creators', 2, 5)).toBe('Picked up Top 10 creators, position 2 of 5.')
 expect(announcement('move', 'Top 10 creators', 3, 5)).toBe('Moved to position 3 of 5.')
 expect(announcement('drop', 'Top 10 creators', 3, 5)).toBe('Dropped at position 3 of 5.')
 expect(announcement('cancel', 'Top 10 creators', 3, 5)).toBe('Reorder cancelled.')
})
