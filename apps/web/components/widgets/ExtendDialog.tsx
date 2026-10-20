'use client'
import { BLOCKS_PER_DAY, MAX_REMAINING_DAYS, type LifetimeDays } from '../../lib/dash/schema'
import { extendPreview, timeLeftLabel } from '../../lib/dash/time'
import { Dialog } from '../ui/Dialog'
import type { ExtendPhase } from './ExtendButton'
import a from './actions.module.css'

export function ExtendDialog({ name, expiresAt, head, lifetimeDays, phase, error, onCancel, onConfirm }: {
 name?: string; expiresAt: number; head: number; lifetimeDays: LifetimeDays; phase: ExtendPhase; error?: string | null; onCancel(): void; onConfirm(): void
}) {
 const busy = phase === 'extending'
 const preview = extendPreview(expiresAt, head, lifetimeDays)
 const target = Math.min(expiresAt + lifetimeDays * BLOCKS_PER_DAY, head + MAX_REMAINING_DAYS * BLOCKS_PER_DAY)
 const expiry = timeLeftLabel(target, head).text.replace(/ left$/, '').replace(/^Expires in /, '')
 return <Dialog open onClose={onCancel} size="sm" dismissible={!busy} title={name ? `Extend “${name}”?` : 'Extend widget?'}
  description="Your wallet signs and pays a small network fee."
  footer={<>
   <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
   <button type="button" className="btn btn-primary" disabled={busy || preview.atCap} aria-busy={busy || undefined} onClick={onConfirm}>{busy ? <><span className="spinner" aria-hidden="true"/>Waiting for wallet…</> : 'Extend'}</button>
  </>}>
  <dl className={a.summary} aria-busy={busy || undefined}>
   <div><dt>Adds</dt><dd>{preview.daysAdded} {preview.daysAdded === 1 ? 'day' : 'days'}</dd></div>
   <div><dt>New expiry</dt><dd>in {expiry}</dd></div>
  </dl>
  {preview.atCap && <div className="notice notice-warn"><div><p>Already at the {MAX_REMAINING_DAYS} day maximum. Extend again once some time has passed.</p></div></div>}
  {phase === 'error' && <p className="notice notice-bad" role="alert">{error ?? "Your wallet couldn't sign. Try again."}</p>}
 </Dialog>
}
