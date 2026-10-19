'use client'
import { useEffect, useState } from 'react'
import { nextTheme, readStoredTheme, resolveTheme, writeStoredTheme, type Theme, type ThemeStore } from '../../lib/theme'

function storage(): ThemeStore | undefined { try { return window.localStorage } catch { return undefined } }
export function ThemeToggle() {
 const [theme, setTheme] = useState<Theme>('dark')
 useEffect(() => {
  const apply = (value: Theme) => { document.documentElement.dataset.theme = value; setTheme(value) }
  apply(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  let media: MediaQueryList
  try { media = window.matchMedia('(prefers-color-scheme: light)') } catch { return }
  const update = () => { if (!readStoredTheme(storage())) apply(resolveTheme(null, media.matches)) }
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
 }, [])
 const label = `Switch to ${nextTheme(theme)} theme`
 return <button type="button" className="theme-btn has-tip" data-tip={label} aria-label={label} onClick={() => {
  const next = nextTheme(theme)
  writeStoredTheme(storage(), next)
  document.documentElement.dataset.theme = next
  setTheme(next)
 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{theme === 'dark' ? <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/> : <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>}</svg></button>
}
