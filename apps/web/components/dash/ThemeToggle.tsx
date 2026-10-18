'use client'
import { useEffect, useRef, useState } from 'react'

export function ThemeToggle() {
 const [theme, setTheme] = useState('dark')
 const chosen = useRef(false)
 useEffect(() => {
  const media = window.matchMedia('(prefers-color-scheme: light)')
  const apply = (next: string) => {
   document.documentElement.dataset.theme = next
   setTheme(next)
  }
  let saved: string | null = null
  try { saved = localStorage.getItem('arkiv-sql-theme') } catch {}
  chosen.current = saved === 'light' || saved === 'dark'
  apply(chosen.current ? saved! : media.matches ? 'light' : 'dark')
  const update = () => { if (!chosen.current) apply(media.matches ? 'light' : 'dark') }
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
 }, [])

 function toggle() {
  const next = theme === 'dark' ? 'light' : 'dark'
  chosen.current = true
  document.documentElement.dataset.theme = next
  setTheme(next)
  try { localStorage.setItem('arkiv-sql-theme', next) } catch {}
 }
 return <button className="theme-btn" onClick={toggle} aria-label="Toggle light and dark theme" title="Toggle theme">{theme === 'dark' ? '☾' : '☼'}</button>
}
