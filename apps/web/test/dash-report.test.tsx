import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { figureNumbers, shareUrls, menuIndex, importedFrom, updatedLabel } from '../lib/dash/report'
import { ShareMenu } from '../components/widgets/ShareMenu'

test('report helpers number only live figures and format attribution and age', () => {
 expect([...figureNumbers([
  { id: 'c', status: 'live', chart: 'counter' }, { id: 'bar', status: 'live', chart: 'bar' },
  { id: 'c2', status: 'live', chart: 'counter' }, { id: 'd', status: 'expired', chart: 'donut' },
  { id: 'table', status: 'live', chart: 'table' },
 ])]).toEqual([['bar', 1], ['table', 2]])
 const u = '0x' + '11'.repeat(20), w = '0x' + '22'.repeat(20), other = '0x' + '33'.repeat(20)
 expect(importedFrom(u, u, w)).toBeNull()
 expect(importedFrom(w, u, w)).toBe('Imported from 0x2222…2222')
 expect(importedFrom(other, u, w)).toStartWith('Imported from 0x')
 expect(updatedLabel(1, 61)).toBe('Updated 2 min ago')
})
test('share URLs and menu navigation are exact', () => {
 expect(shareUrls('https://a.b', '0xk', 'Expiry watch')).toEqual({
  link: 'https://a.b/d/0xk',
  x: 'https://x.com/intent/post?text=Expiry%20watch%2C%20a%20live%20report%20on%20Arkiv%20SQL%20Indexer&url=https%3A%2F%2Fa.b%2Fd%2F0xk',
 })
 for (const [key, index, expected] of [['ArrowDown', 1, 0], ['ArrowUp', 0, 1], ['Home', 1, 0], ['End', 0, 1], ['Escape', 0, 'close'], ['a', 0, null]] as const) expect(menuIndex(key, index, 2)).toBe(expected)
})
test('share menu exposes two accessible items and a hidden closed menu', () => {
 const closed = render(<ShareMenu title="Expiry watch" dashboardKey="0xk"/>)
 for (const text of ['aria-label="Share dashboard"', 'aria-haspopup="menu"', 'aria-expanded="false"', 'hidden=""']) expect(closed).toContain(text)
 const open = render(<ShareMenu title="Expiry watch" dashboardKey="0xk" initialOpen/>)
 for (const text of ['aria-expanded="true"', 'role="menu"', 'Copy link', 'Post on X', 'target="_blank"', 'rel="noopener noreferrer"', 'aria-live="polite"']) expect(open).toContain(text)
 expect(open.match(/role="menuitem"/g)).toHaveLength(2)
 expect(open).toContain(shareUrls('', '0xk', 'Expiry watch').x.replaceAll('&', '&amp;'))
})
test('figure CSS keeps hover actions keyboard reachable with faint borders', () => {
 const css = readFileSync(new URL('../components/widgets/report.module.css', import.meta.url), 'utf8').replace(/\s+/g, '')
 expect(css).toContain('border:1pxsolidvar(--border-faint)')
 expect(css).toContain('border-radius:4px')
 expect(css).toContain('opacity:0')
 expect(css).toContain('pointer-events:none')
 expect(css).toMatch(/:focus-within[^}]*opacity:1/)
 expect(css).toContain('@media(hover:none)')
 expect(css.split('@media(hover:none)')[0]).not.toContain('display:none')
 expect(css.match(/box-shadow:([^;}]+)/g)?.every(v => v === 'box-shadow:none' || v === 'box-shadow:var(--shadow-pop)')).toBe(true)
})
