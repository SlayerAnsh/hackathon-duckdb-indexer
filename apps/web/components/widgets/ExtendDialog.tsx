'use client'
import { useEffect, useId, useRef } from 'react'
import { BLOCKS_PER_DAY, MAX_REMAINING_DAYS, type LifetimeDays } from '../../lib/dash/schema'
import { extendPreview, timeLeftLabel } from '../../lib/dash/time'
import type { ExtendPhase } from './ExtendButton'

export function ExtendDialog({ name, expiresAt, head, lifetimeDays, phase, onCancel, onConfirm }: {
 name?: string; expiresAt: number; head: number; lifetimeDays: LifetimeDays; phase: ExtendPhase; onCancel(): void; onConfirm(): void
}) {
 const dialog = useRef<HTMLDivElement>(null)
 const title = useId()
 const body = useId()
 const busy = phase === 'extending'
 const preview = extendPreview(expiresAt, head, lifetimeDays)
 const target = Math.min(expiresAt + lifetimeDays * BLOCKS_PER_DAY, head + MAX_REMAINING_DAYS * BLOCKS_PER_DAY)
 const expiry = timeLeftLabel(target, head).text.replace(/ left$/, '').replace(/^Expires in /, '')
 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null
  dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
  return () => previous?.focus()
 }, [])
 return <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--surface) 70%, transparent)' }}>
  <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={title} aria-describedby={body} aria-busy={busy} tabIndex={-1} style={{ width: 'calc(100% - 32px)', maxWidth: 380, padding: 24, background: 'var(--card)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-pop)' }} onKeyDown={event => {
   if (event.key === 'Escape') { event.preventDefault(); if (!busy) onCancel() }
   if (event.key !== 'Tab') return
   const buttons = Array.from(dialog.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
   event.preventDefault()
   if (!buttons.length) { dialog.current?.focus(); return }
   const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
   buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus()
  }}>
   <h2 id={title}>{name ? `Extend “${name}”?` : 'Extend widget?'}</h2>
   <p id={body}>Adds {preview.daysAdded} {preview.daysAdded === 1 ? 'day' : 'days'}. New expiry: in {expiry}. Our wallet pays, you pay nothing.</p>
   {phase === 'error' && <p className="error" role="alert">Couldn't extend. Try again.</p>}
   <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
    <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
    <button type="button" className="btn btn-primary" disabled={busy || preview.atCap} onClick={onConfirm}>{busy ? 'Extending…' : 'Extend'}</button>
   </div>
  </div>
 </div>
}
