import type { ChartType } from './schema'

export type ImportState = { tab: 'mine' | 'all'; search: string; chart: ChartType | null; pages: number; selected: string[] }
export type ImportAction = { type: 'tab'; value: 'mine' | 'all' } | { type: 'search'; value: string } | { type: 'chart'; value: ChartType | null }
 | { type: 'more' } | { type: 'toggle'; key: string; disabled: Set<string>; remaining: number }
export function initImport(): ImportState { return { tab: 'mine', search: '', chart: null, pages: 1, selected: [] } }
export function importReducer(s: ImportState, a: ImportAction): ImportState {
 switch (a.type) {
  case 'tab': return { ...s, tab: a.value, pages: 1 }
  case 'search': return { ...s, search: a.value, pages: 1 }
  case 'chart': return { ...s, chart: a.value, pages: 1 }
  case 'more': return { ...s, pages: s.pages + 1 }
  case 'toggle': {
   if (a.disabled.has(a.key)) return s
   if (s.selected.includes(a.key)) return { ...s, selected: s.selected.filter(key => key !== a.key) }
   if (s.selected.length >= a.remaining) return s
   return { ...s, selected: [...s.selected, a.key] }
  }
 }
}
export function addLabel(count: number): string { return count === 0 ? 'Add widgets' : `Add ${count} ${count === 1 ? 'widget' : 'widgets'}` }
