'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { Login } from '../../lib/dash/schema'
import { addressUrl } from '../../lib/explorer'
import { formatGlm, type BalanceLevel } from '../../lib/dash/wallet'
import { useWalletBalance } from '../../lib/dash/use-balance'
import { useDashAuth } from '../auth/DashAuthProvider'
import a from './account.module.css'

export const PROVIDER_LABELS: Record<Login, string> = { google: 'Google', discord: 'Discord', x: 'X', telegram: 'Telegram' }
export const PROVIDER_GLYPHS: Record<Login, string> = { google: 'G', discord: '◉', x: '𝕏', telegram: '➤' }
export function menuIndex(key: string, index: number, count: number): number {
 if (count <= 0) return 0
 if (key === 'Home') return 0
 if (key === 'End') return count - 1
 if (key === 'ArrowDown') return (index + 1) % count
 if (key === 'ArrowUp') return (index + count - 1) % count
 return index
}
const icon = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
const Warn = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 1.75 14.5 13.5h-13Z"/><path d="M8 6.25V9M8 11.25h.01"/></svg>
const LINKS = [
 { href: '/me', label: 'My home', path: <><path d="M2.5 7 8 2.5 13.5 7"/><path d="M4 6v7.5h8V6"/></> },
 { href: '/widgets/new', label: 'New widget', path: <path d="M8 3v10M3 8h10"/> },
 { href: '/explore', label: 'Explore', path: <><circle cx="8" cy="8" r="5.5"/><path d="m10.5 5.5-1.6 3.4-3.4 1.6 1.6-3.4Z"/></> },
] as const

export function AccountPopoverView({ address, login, balance, copied, onCopy, onClose, onLogout, id }: {
 address: string; login: Login; balance: { wei: bigint | null; level: BalanceLevel }; copied: boolean; onCopy(): void; onClose(): void; onLogout(): void; id?: string
}) {
 const explorer = addressUrl(address)
 return <div id={id} className={`popover ${a.pop}`} role="dialog" aria-label="Account">
  <div className={`${a.sec} ${a.ident}`}>
   <span className={`${a.dot} ${a.dotLg}`} aria-hidden="true">{PROVIDER_GLYPHS[login]}</span>
   <div className={a.identText}>
    <span className={a.provider}>Signed in with {PROVIDER_LABELS[login]}</span>
    <span className={a.addrRow}><span className={a.addr} title={address}>{address.slice(0, 8)}…{address.slice(-6)}</span>
     <button type="button" className="ib ib-sm has-tip" data-tip={copied ? 'Copied' : 'Copy address'} aria-label={copied ? 'Copied' : 'Copy address'} data-autofocus="true" onClick={onCopy}>
      {copied ? <svg {...icon}><path d="m3 8.5 3 3 7-7"/></svg> : <svg {...icon}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5"/></svg>}
     </button>
     {explorer && <a className="ib ib-sm has-tip" data-tip="View on explorer" aria-label="View on explorer" href={explorer} target="_blank" rel="noreferrer"><svg {...icon}><path d="M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/></svg></a>}
    </span>
    <span className="sr-only" aria-live="polite">{copied ? 'Address copied' : ''}</span>
   </div>
  </div>
  <div className={a.sec}>
   <div className={a.balRow}><span className={a.label}>Balance</span>{balance.wei === null ? <span className={a.unknown}>Balance unavailable</span> : <span className={a.glm}>{formatGlm(balance.wei)}</span>}</div>
   <p className={a.net}>Rabdi testnet. Pays for extend, transfer and delete.</p>
   {balance.wei !== null && balance.level === 'low' && <p className={`${a.note} ${a.warn}`}><Warn/>Below 0.1 tGLM. Extending and deleting widgets may fail.</p>}
   {balance.wei !== null && balance.level === 'empty' && <p className={`${a.note} ${a.bad}`}><Warn/>No tGLM. Fund this address to extend or delete widgets.</p>}
  </div>
  <div className={`${a.sec} ${a.links}`}>
   {LINKS.map(link => <Link key={link.href} href={link.href} className="mi" data-menu-item="true" onClick={onClose}><svg {...icon}>{link.path}</svg>{link.label}</Link>)}
  </div>
  <div className={`${a.sec} ${a.links}`}>
   <button type="button" className={`mi ${a.logout}`} data-menu-item="true" onClick={onLogout}><svg {...icon}><path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6M10.5 11 13.5 8l-3-3M13.5 8H6"/></svg>Log out</button>
  </div>
 </div>
}

export function AccountPopover({ address, login, onClose, onLogout, id }: { address: string; login: Login; onClose(): void; onLogout(): Promise<void>; id?: string }) {
 const { config } = useDashAuth()
 const balance = useWalletBalance(address, config?.rpcUrl)
 const [copied, setCopied] = useState(false)
 const root = useRef<HTMLDivElement>(null)
 useEffect(() => {
  root.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  function outside(event: PointerEvent) {
   if (event.target instanceof Node && !root.current?.parentElement?.contains(event.target)) onClose()
  }
  document.addEventListener('pointerdown', outside)
  return () => document.removeEventListener('pointerdown', outside)
 }, [onClose])
 useEffect(() => {
  if (!copied) return
  const timer = setTimeout(() => setCopied(false), 1500)
  return () => clearTimeout(timer)
 }, [copied])
 return <div ref={root} className={a.popWrap} onKeyDown={event => {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const items = Array.from(root.current!.querySelectorAll<HTMLElement>('[data-menu-item]'))
  const current = items.indexOf(document.activeElement as HTMLElement)
  items[current < 0 ? (event.key === 'ArrowUp' || event.key === 'End' ? items.length - 1 : 0) : menuIndex(event.key, current, items.length)]?.focus()
 }}>
  <AccountPopoverView id={id} address={address} login={login} balance={balance} copied={copied}
   onCopy={() => { void navigator.clipboard?.writeText(address).then(() => setCopied(true)).catch(() => {}) }}
   onClose={onClose} onLogout={() => { onClose(); void onLogout() }}/>
 </div>
}
