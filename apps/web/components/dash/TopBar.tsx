'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { IndexState } from '../../lib/indexdb'
import { useIndex } from '../../lib/use-index'
import { StatusBar, TopStateChip } from './StatusBar'
import { AccountButton } from '../widgets/AccountButton'
import { ThemeToggle } from './ThemeToggle'

export const NAV_ITEMS: readonly { href: string; label: string; match: readonly string[] }[] = [
 { href: '/', label: 'Home', match: ['/'] },
 { href: '/explore', label: 'Explore', match: ['/explore', '/d', '/widgets'] },
 { href: '/playground', label: 'Playground', match: ['/playground'] },
 { href: '/about', label: 'About', match: ['/about'] },
]
export function isActiveRoute(pathname: string | null, item: { href: string; match?: readonly string[] }): boolean {
 if (!pathname) return false
 const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
 return (item.match ?? [item.href]).some(prefix => path === prefix || (prefix !== '/' && path.startsWith(prefix + '/')))
}
export function nextMenuOpen(open: boolean, event: 'toggle' | 'escape' | 'navigate'): boolean { return event === 'toggle' ? !open : false }
export function PageNav({ pathname }: { pathname: string | null }) {
 return <nav className="nav" aria-label="Pages">{NAV_ITEMS.map(item => <Link key={item.href} className="nav-a" href={item.href} aria-current={isActiveRoute(pathname, item) ? 'page' : undefined}>{item.label}</Link>)}</nav>
}
export function TopBarView({ pathname, state, menuOpen = false, onMenu, account, theme }: { pathname: string | null; state?: IndexState; menuOpen?: boolean; onMenu?(event: 'toggle' | 'escape' | 'navigate'): void; account?: ReactNode; theme?: ReactNode }) {
 return <><a className="skip" href="#main">Skip to content</a><header className="top" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { event.preventDefault(); onMenu?.('escape') } }}><div className="wrap top-in">
  <Link className="brand" href="/"><span className="brand-mark">A</span><span>Arkiv <b>SQL Indexer</b></span></Link>
  <PageNav pathname={pathname}/>
  <div className="top-end">{state && <TopStateChip state={state}/>}<div className="top-desktop">{theme}{account}</div><button type="button" className="nav-menu-btn" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="nav-sheet" onClick={() => onMenu?.('toggle')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={menuOpen ? 'M6 6l12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'}/></svg></button></div>
 </div>{menuOpen && <nav id="nav-sheet" className="nav-sheet" aria-label="Mobile pages">{NAV_ITEMS.map(item => <Link key={item.href} href={item.href} aria-current={isActiveRoute(pathname, item) ? 'page' : undefined} onClick={() => onMenu?.('navigate')}>{item.label}{isActiveRoute(pathname, item) && <span className="cur">Current</span>}</Link>)}<div className="nav-sheet-actions">{account}{theme}</div></nav>}</header></>
}
export function TopBar({ state }: { state?: IndexState }) {
 const pathname = usePathname()
 const index = useIndex()
 const current = state ?? index.state
 const [menuOpen, setMenuOpen] = useState(false)
 const shell = useRef<HTMLDivElement>(null)
 useEffect(() => { if (menuOpen) shell.current?.querySelector<HTMLAnchorElement>('.nav-sheet a')?.focus() }, [menuOpen])
 function onMenu(event: 'toggle' | 'escape' | 'navigate') {
  const next = nextMenuOpen(menuOpen, event)
  setMenuOpen(next)
  if (!next) shell.current?.querySelector<HTMLButtonElement>('.nav-menu-btn')?.focus()
 }
 return <><div ref={shell} className="shell"><TopBarView pathname={pathname} state={current} menuOpen={menuOpen} onMenu={onMenu} account={<AccountButton/>} theme={<ThemeToggle/>}/></div><StatusBar state={current}/></>
}
