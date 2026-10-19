import { CHART_TYPES, type ChartType } from './schema'
import type { WidgetListItem, WidgetListQuery } from './sql'
import type { PendingWrite } from './pending'

export type ExplorerState = { search: string; chart: ChartType | null; sort: 'newest' | 'used' | 'expiring'; mine: boolean; pages: number }
type ExplorerAction = { type: 'search'; value: string } | { type: 'chart'; value: ChartType | null } | { type: 'sort'; value: ExplorerState['sort'] } | { type: 'mine'; value: boolean } | { type: 'more' } | { type: 'clear' }
export function initExplorer(): ExplorerState { return { search: '', chart: null, sort: 'newest', mine: false, pages: 1 } }
export function explorerReducer(s: ExplorerState, a: ExplorerAction): ExplorerState {
 if (a.type === 'more') return { ...s, pages: s.pages + 1 }
 if (a.type === 'clear') return { ...initExplorer(), mine: s.mine }
 return { ...s, [a.type]: a.value, pages: 1 }
}
export function explorerQuery(s: ExplorerState, address: string | undefined): WidgetListQuery {
 return { search: s.search, chart: s.chart, sort: s.sort, user: s.mine ? address ?? null : null, limit: 12 * s.pages, offset: 0 }
}
export function mergeExplorerItems(items: WidgetListItem[], pending: PendingWrite[], state: ExplorerState, address?: string): WidgetListItem[] {
 if (state.sort !== 'newest') return items
 const known = new Set(items.map(item => item.key))
 const search = state.search.toLowerCase()
 const added: WidgetListItem[] = []
 for (const write of [...pending].reverse()) {
  const f = write.fields
  if (write.kind !== 'widget' || write.op !== 'upsert' || known.has(write.key) || !f || typeof f.name !== 'string' || !CHART_TYPES.includes(f.chart as ChartType) || typeof f.user !== 'string') continue
  const user = f.user.toLowerCase()
  const owner = typeof f.owner === 'string' ? f.owner.toLowerCase() : ''
  if (state.chart && state.chart !== f.chart || state.mine && address && owner !== address.toLowerCase()) continue
  if (search && !f.name.toLowerCase().includes(search) && !(/^0x[0-9a-f]{0,40}$/i.test(search) && user.startsWith(search))) continue
  known.add(write.key)
  added.push({ key: write.key, name: f.name, chart: f.chart as ChartType, user, owner, expiresAt: Number(f.expiresAt ?? 0), createdAt: write.afterBlock, uses: 0 })
 }
 return [...added, ...items]
}
