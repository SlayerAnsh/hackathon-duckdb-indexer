export type Theme = 'light' | 'dark'
export const THEME_KEY = 'arkiv-sql-theme'
export type ThemeStore = { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function readStoredTheme(store: ThemeStore | undefined): Theme | null {
 try { const value = store?.getItem(THEME_KEY); return value === 'light' || value === 'dark' ? value : null } catch { return null }
}
export function writeStoredTheme(store: ThemeStore | undefined, theme: Theme): void {
 try { store?.setItem(THEME_KEY, theme) } catch {}
}
export function resolveTheme(stored: Theme | null, prefersLight: boolean): Theme { return stored ?? (prefersLight ? 'light' : 'dark') }
export function nextTheme(current: Theme): Theme { return current === 'dark' ? 'light' : 'dark' }
export const THEME_INIT_SCRIPT = `(function(){var theme;try{theme=window.localStorage.getItem('arkiv-sql-theme')}catch(e){}if(theme!=='light'&&theme!=='dark'){theme='dark';try{if(window.matchMedia('(prefers-color-scheme: light)').matches)theme='light'}catch(e){}}document.documentElement.dataset.theme=theme})()`
