import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { readStoredTheme, writeStoredTheme, resolveTheme, nextTheme, THEME_INIT_SCRIPT } from '../lib/theme'
import { TopBarView, nextMenuOpen } from '../components/dash/TopBar'
import { Footer } from '../components/dash/Footer'

test('theme storage is validated and storage errors are harmless', () => {
 const store = (value: string | null) => ({ getItem: () => value, setItem() {} })
 expect(readStoredTheme(store('light'))).toBe('light')
 expect(readStoredTheme(store('blue'))).toBeNull()
 expect(readStoredTheme(undefined)).toBeNull()
 const blocked = { getItem() { throw Error() }, setItem() { throw Error() } }
 expect(readStoredTheme(blocked)).toBeNull()
 expect(() => writeStoredTheme(blocked, 'dark')).not.toThrow()
 expect(resolveTheme('light', false)).toBe('light')
 expect(resolveTheme(null, true)).toBe('light')
 expect(resolveTheme(null, false)).toBe('dark')
 expect(nextTheme('dark')).toBe('light')
})
test('head script sets theme before paint even with blocked or missing browser APIs', () => {
 for (const [window, expected] of [
  [{ localStorage: { getItem: () => 'light' } }, 'light'],
  [{ get localStorage() { throw Error() }, matchMedia: () => ({ matches: true }) }, 'light'],
  [{}, 'dark'],
  [{ get localStorage() { throw Error() }, matchMedia() { throw Error() } }, 'dark'],
 ] as const) {
  const document = { documentElement: { dataset: { theme: '' } } }
  new Function('window', 'document', THEME_INIT_SCRIPT)(window, document)
  expect(document.documentElement.dataset.theme).toBe(expected)
 }
})
test('console tokens include dark defaults and both light fallbacks', () => {
 const css = readFileSync(new URL('../app/theme.css', import.meta.url), 'utf8').replace(/\s+/g, '')
 const root = css.match(/:root\{([^}]+)/)![1]
 for (const token of ['--surface:#121212', '--accent-strong:#3ecf8e', '--accent-ink:#06261a', '--border-faint:#242424', '--r-md:6px']) expect(root).toContain(token)
 expect(css).toContain('@media(prefers-color-scheme:light){:root:not([data-theme="dark"])')
 const light = css.match(/:root\[data-theme="light"\]\{([^}]+)/)![1]
 for (const token of ['--surface:#fbfbfa', '--accent:#0d7a4d', '--border-faint:#e9e9e7']) expect(light).toContain(token)
})
test('navbar and phone sheet use the calm navigation and accessible controls', () => {
 const html = renderToStaticMarkup(<TopBarView pathname="/d/0x1" state={{ status: 'loading' }}/>)
 expect(html.match(/aria-current="page"/g)).toHaveLength(1)
 expect(html).toContain('href="#main"'); expect(html).toContain('Skip to content'); expect(html).toContain('SQL Indexer')
 expect(html).toContain('aria-expanded="false"'); expect(html).toContain('aria-label="Open menu"')
 let previous = -1
 for (const href of ['/', '/explore', '/playground', '/about']) {
  const index = html.indexOf(`class="nav-a"`, previous + 1)
  expect(index).toBeGreaterThan(previous); expect(html.slice(index, html.indexOf('</a>', index))).toContain(`href="${href}"`); previous = index
 }
 const open = renderToStaticMarkup(<TopBarView pathname="/d/0x1" menuOpen/>)
 expect(open).toContain('aria-label="Close menu"'); expect(open).toContain('aria-expanded="true"'); expect(open).toContain('nav-sheet')
 expect(nextMenuOpen(false, 'toggle')).toBe(true)
 expect(nextMenuOpen(true, 'escape')).toBe(false)
 expect(nextMenuOpen(true, 'navigate')).toBe(false)
})
test('footer links to the new shell destinations', () => {
 const html = renderToStaticMarkup(<Footer/>)
 for (const href of ['/', '/explore', '/playground', '/about']) expect(html).toContain(`href="${href}"`)
 expect(html).not.toContain('/showcase')
})
test('root layout installs the head script and every shell page has the skip target', () => {
 const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
 const layout = source('../app/layout.tsx')
 expect(layout).toContain('suppressHydrationWarning')
 expect(layout).toContain('<head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}/></head>')
 for (const path of ['../components/landing/Home.tsx', '../components/playground/Playground.tsx', '../app/about/page.tsx', '../app/me/page.tsx', '../app/d/[key]/page.tsx', '../app/d/[key]/edit/page.tsx', '../components/explore/ExplorePage.tsx', '../app/widgets/[key]/page.tsx', '../app/widgets/new/page.tsx']) expect(source(path)).toContain('<main id="main"')
 const css = source('../app/theme.css').replace(/\s+/g, '')
 expect(css.match(/:root\[data-theme="light"\]\{([^}]+)/)![1]).toBe(css.match(/:root:not\(\[data-theme="dark"\]\)\{([^}]+)/)![1])
})
