'use client'
import Link from 'next/link'
import { useEffect, useRef } from 'react'
import type { Login } from '../../lib/dash/schema'
import { shortHex } from '../../lib/format'

export const PROVIDER_LABELS: Record<Login, string> = { google: 'Google', discord: 'Discord', x: 'X', telegram: 'Telegram' }
export function menuIndex(key: string, index: number, count: number): number {
 if (count <= 0) return 0
 if (key === 'Home') return 0
 if (key === 'End') return count - 1
 if (key === 'ArrowDown') return (index + 1) % count
 if (key === 'ArrowUp') return (index + count - 1) % count
 return index
}
export function AvatarMenu({ address, login, open, onClose, onLogout, id }: {
 address: string; login: Login; open: boolean; onClose(): void; onLogout(): Promise<void>; id?: string
}) {
 const menu = useRef<HTMLDivElement>(null)
 useEffect(() => {
  if (!open) return
  menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  function outside(event: PointerEvent) {
   if (event.target instanceof Node && !menu.current?.parentElement?.contains(event.target)) onClose()
  }
  document.addEventListener('pointerdown', outside)
  return () => document.removeEventListener('pointerdown', outside)
 }, [open, onClose])
 if (!open) return null
 return <div ref={menu} id={id} className="avatar-menu" role="menu" aria-label="Account" onKeyDown={event => {
  if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const items = Array.from(menu.current!.querySelectorAll<HTMLElement>('[role="menuitem"]'))
  items[menuIndex(event.key, items.indexOf(document.activeElement as HTMLElement), items.length)]?.focus()
 }} onBlur={event => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) onClose() }}>
  <div className="avatar-meta"><span title={address}>{shortHex(address)}</span><span>via {PROVIDER_LABELS[login]}</span></div>
  <Link href="/me" role="menuitem" onClick={onClose}>My home</Link>
  <button type="button" role="menuitem" onClick={() => { onClose(); void onLogout() }}>Log out</button>
 </div>
}
