'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { menuIndex, shareUrls } from '../../lib/dash/report'
import s from './report.module.css'

const LinkIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6.5 9.5 9.5 6.5M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1"/></svg>
const CheckIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>
const PostIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" strokeLinejoin="round"/></svg>
const ExternalIcon = () => <svg className="mi-end" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3h4v4M13 3 7.5 8.5M11.5 9.5v3h-8v-8h3"/></svg>

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
  <button ref={button} type="button" className="btn btn-sm btn-quiet" aria-label="Share dashboard" aria-haspopup="menu" aria-expanded={open} aria-controls={id}
   onClick={() => setOpen(value => !value)} onKeyDown={event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true) }
    if (event.key === 'Escape') { event.preventDefault(); close() }
   }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2v8M5 5l3-3 3 3M5 7H3v7h10V7h-2"/></svg><span className={s.toolLabel}>Share</span></button>
  <ul className="menu" id={id} ref={menu} role="menu" aria-label="Share dashboard" hidden={!open} onKeyDown={event => {
   const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
   const next = menuIndex(event.key, items.indexOf(document.activeElement as HTMLElement), items.length)
   if (next === null) return
   event.preventDefault()
   if (next === 'close') close()
   else items[next]?.focus()
  }}>
   <li role="none"><button type="button" role="menuitem" className={copied ? `mi ${s.copied}` : 'mi'} onClick={() => void copy()}>{copied ? <CheckIcon/> : <LinkIcon/>}{copied ? 'Link copied' : 'Copy link'}</button></li>
   <li role="none"><a role="menuitem" className="mi" href={urls.x} target="_blank" rel="noopener noreferrer"><PostIcon/>Post on X<ExternalIcon/></a></li>
  </ul>
  <span className={s.announcement} aria-live="polite">{copied ? 'Link copied' : ''}</span>
 </div>
}
