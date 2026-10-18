'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { IndexState } from '../../lib/indexdb'
import { StatusBar, TopStateChip } from './StatusBar'
import { ThemeToggle } from './ThemeToggle'

export const NAV_ITEMS = [
 { href: '/', label: 'Overview' },
 { href: '/showcase', label: 'Showcase' },
 { href: '/playground', label: 'Playground' },
 { href: '/about', label: 'About' },
] as const

export function isActiveRoute(pathname: string | null, href: string): boolean {
 if (!pathname) return false
 const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
 return href === '/' ? path === '/' : path === href || path.startsWith(href + '/')
}

export function PageNav({ pathname }: { pathname: string | null }) {
 return <nav className="nav" aria-label="Pages">{NAV_ITEMS.map(item => {
  const active = isActiveRoute(pathname, item.href)
  return <Link key={item.href} href={item.href} className="nav-a" aria-current={active ? 'page' : undefined}>{item.label}</Link>
 })}</nav>
}

// Without index state (static pages such as /about) the bar omits the index status chip and status bar.
export function TopBar({ state }: { state?: IndexState }) {
 const pathname = usePathname()
 return <><header className="top"><div className="wrap top-in">
  <Link className="brand" href="/"><span className="brand-mark">A</span><span>Arkiv <b>SQL</b></span></Link>
  <PageNav pathname={pathname}/>
  <span className="top-sp"/>
  {state && <TopStateChip state={state}/>}
  <ThemeToggle/>
 </div></header>{state && <StatusBar state={state}/>}</>
}
