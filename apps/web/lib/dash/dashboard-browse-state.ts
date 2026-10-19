import type { DashboardListQuery } from './sql'
export type DashboardBrowseState = { search: string; sort: 'newest' | 'widgets' | 'expiring'; official: boolean; pages: number }
type Action = { type: 'search'; value: string } | { type: 'sort'; value: DashboardBrowseState['sort'] } | { type: 'official'; value: boolean } | { type: 'more' } | { type: 'clear' }
export function initDashboardBrowse(): DashboardBrowseState { return { search: '', sort: 'newest', official: false, pages: 1 } }
export function dashboardBrowseReducer(s: DashboardBrowseState, a: Action): DashboardBrowseState {
 if (a.type === 'clear') return initDashboardBrowse()
 if (a.type === 'more') return { ...s, pages: s.pages + 1 }
 return { ...s, [a.type]: a.value, pages: 1 }
}
export function dashboardBrowseQuery(s: DashboardBrowseState): DashboardListQuery { return { search: s.search, sort: s.sort, official: s.official, limit: 12 * s.pages, offset: 0 } }
export function resultsLine(total: number, s: DashboardBrowseState): string {
 return `${total} ${s.official ? 'official ' : ''}${total === 1 ? 'dashboard' : 'dashboards'}, ${{newest:'newest first', widgets:'most widgets first', expiring:'expiring soonest first'}[s.sort]}`
}
