export type ExploreTab = 'dashboards' | 'widgets'
export function tabFromSearch(search: string | URLSearchParams): ExploreTab {
 return new URLSearchParams(search).get('tab') === 'widgets' ? 'widgets' : 'dashboards'
}
export function searchForTab(current: string, tab: ExploreTab): string {
 const params = new URLSearchParams(current)
 if (tab === 'dashboards') params.delete('tab')
 else params.set('tab', tab)
 return params.size ? '?' + params.toString() : ''
}
export function tabAfterKey(tab: ExploreTab, key: string): ExploreTab {
 if (key === 'Home') return 'dashboards'
 if (key === 'End') return 'widgets'
 return key === 'ArrowLeft' || key === 'ArrowRight' ? tab === 'widgets' ? 'dashboards' : 'widgets' : tab
}
