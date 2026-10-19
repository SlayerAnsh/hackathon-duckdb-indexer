'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { menuIndex, shareUrls } from '../../lib/dash/report'
import s from './report.module.css'

export function ShareMenu({ title, dashboardKey, initialOpen = false }: { title: string; dashboardKey: string; initialOpen?: boolean }) {
 const [open, setOpen] = useState(initialOpen)
 const [copied, setCopied] = useState(false)
 const [origin, setOrigin] = useState('')
 const root = useRef<HTMLDivElement>(null)
 const button = useRef<HTMLButtonElement>(null)
 const menu = useRef<HTMLUListElement>(null)
 const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
 const id = useId()
 const urls = shareUrls(origin, dashboardKey, title)
 function close() { setOpen(false); button.current?.focus() }
 useEffect(() => {
  setOrigin(location.origin)
  return () => { if (timer.current) clearTimeout(timer.current) }
 }, [])
 useEffect(() => {
  if (!open) return
  menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  function outside(event: MouseEvent) { if (!root.current?.contains(event.target as Node)) close() }
  document.addEventListener('click', outside)
  return () => document.removeEventListener('click', outside)
 }, [open])
 async function copy() {
  try {
   await navigator.clipboard.writeText(shareUrls(location.origin, dashboardKey, title).link)
   setCopied(true)
   if (timer.current) clearTimeout(timer.current)
   timer.current = setTimeout(() => setCopied(false), 2000)
  } catch { /* Clipboard access may be unavailable. Keep the item unchanged. */ }
 }
 return <div className={s.share} ref={root}>
  <button ref={button} type="button" className="ib has-tip" data-tip="Share" aria-label="Share dashboard" aria-haspopup="menu" aria-expanded={open} aria-controls={id}
   onClick={() => setOpen(value => !value)} onKeyDown={event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true) }
    if (event.key === 'Escape') { event.preventDefault(); close() }
   }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 2v8M5 5l3-3 3 3M5 7H3v7h10V7h-2"/></svg></button>
  <ul className="menu" id={id} ref={menu} role="menu" aria-label="Share dashboard" hidden={!open} onKeyDown={event => {
   const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
   const next = menuIndex(event.key, items.indexOf(document.activeElement as HTMLElement), items.length)
   if (next === null) return
   event.preventDefault()
   if (next === 'close') close()
   else items[next]?.focus()
  }}>
   <li role="none"><button type="button" role="menuitem" className="mi" onClick={() => void copy()}><span aria-hidden="true">⧉</span>{copied ? '✓ Link copied' : 'Copy link'}</button></li>
   <li role="none"><a role="menuitem" className="mi" href={urls.x} target="_blank" rel="noopener noreferrer"><span aria-hidden="true">𝕏</span>Post on X</a></li>
  </ul>
  <span className={s.announcement} aria-live="polite">{copied ? '✓ Link copied' : ''}</span>
 </div>
}
