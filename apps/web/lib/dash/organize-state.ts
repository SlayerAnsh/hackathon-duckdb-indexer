import { arrayMove } from '@dnd-kit/sortable'
import type { DashboardEntity } from './entities'
import { defaultSize, MAX_LINKS_PER_DASHBOARD, type ChartType, type LifetimeDays, type Size } from './schema'
import type { Slot } from './slots'

export type DraftItem = { id: string; link: string | null; widget: string; name: string; chart: ChartType | null; size: Size; imported: boolean;
 expiresAt: number | null; lifetimeDays: LifetimeDays | null; expired: boolean; flash: boolean }
export type OrganizeDraft = { title: string; items: DraftItem[] }
export type ImportCandidate = { key: string; name: string; chart: ChartType; user: string; expiresAt: number; lifetimeDays: LifetimeDays | null }
export type OrganizeAction = { type: 'move'; from: number; to: number } | { type: 'resize'; id: string; size: Size } | { type: 'remove'; id: string }
 | { type: 'import'; widgets: ImportCandidate[]; owner: string } | { type: 'title'; value: string } | { type: 'clearFlash' }

export function draftFromDashboard(dashboard: DashboardEntity, slots: Slot[]): OrganizeDraft {
 return { title: dashboard.title, items: slots.map(slot => ({
  id: slot.linkKey, link: slot.linkKey, widget: slot.widgetKey, name: slot.name, chart: slot.widget?.chart ?? null,
  size: slot.size, imported: slot.widget ? slot.widget.user !== dashboard.user : false,
  expiresAt: slot.widget?.expiresAt ?? null, lifetimeDays: slot.widget?.widget.lifetimeDays ?? null,
  expired: slot.status === 'expired', flash: false,
 })) }
}

export function organizeReducer(draft: OrganizeDraft, action: OrganizeAction): OrganizeDraft {
 switch (action.type) {
  case 'move': return { ...draft, items: arrayMove(draft.items, action.from, action.to) }
  case 'resize': return { ...draft, items: draft.items.map(item => item.id === action.id ? { ...item, size: action.size } : item) }
  case 'remove': return { ...draft, items: draft.items.filter(item => item.id !== action.id) }
  case 'title': return { ...draft, title: action.value }
  case 'clearFlash': return { ...draft, items: draft.items.map(item => ({ ...item, flash: false })) }
  case 'import': {
   const placed = onDashboard(draft)
   const items = [...draft.items]
   for (const widget of action.widgets) {
    if (items.length >= MAX_LINKS_PER_DASHBOARD) break
    if (placed.has(widget.key)) continue
    placed.add(widget.key)
    items.push({ id: 'new:' + widget.key, link: null, widget: widget.key, name: widget.name, chart: widget.chart,
     size: defaultSize(widget.chart), imported: widget.user !== action.owner, expiresAt: widget.expiresAt,
     lifetimeDays: widget.lifetimeDays, expired: false, flash: true })
   }
   return { ...draft, items }
  }
 }
}

export function isDirty(draft: OrganizeDraft, original: OrganizeDraft): boolean {
 return draft.title !== original.title || draft.items.length !== original.items.length || draft.items.some((item, index) => {
  const before = original.items[index]!
  return item.link !== before.link || item.widget !== before.widget || item.size !== before.size
 })
}

export function toOrganizeInput(draft: OrganizeDraft, original: OrganizeDraft): { title?: string; items: { link: string | null; widget: string; size: Size }[] } {
 return { ...(draft.title !== original.title ? { title: draft.title.trim() } : {}),
  items: draft.items.map(({ link, widget, size }) => ({ link, widget, size })) }
}

export function remainingSlots(draft: OrganizeDraft): number { return Math.max(0, MAX_LINKS_PER_DASHBOARD - draft.items.length) }
export function onDashboard(draft: OrganizeDraft): Set<string> { return new Set(draft.items.map(item => item.widget)) }

export function announcement(kind: 'start' | 'move' | 'drop' | 'cancel', name: string, position: number, count: number): string {
 switch (kind) {
  case 'start': return `Picked up ${name}, position ${position} of ${count}.`
  case 'move': return `Moved to position ${position} of ${count}.`
  case 'drop': return `Dropped at position ${position} of ${count}.`
  case 'cancel': return 'Reorder cancelled.'
 }
}
