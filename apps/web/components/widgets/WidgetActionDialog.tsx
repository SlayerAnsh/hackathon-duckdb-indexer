'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { useDashAuth } from '../auth/DashAuthProvider'
import { deleteWidgetDirect, transferWidgetDirect, transferAddressError, walletErrorKind, walletErrorMessage, type DirectResult } from '../../lib/dash/widget-actions'

export type ActionPhase = 'idle' | 'confirm' | 'signing' | 'error'
type ActionEvent = 'open' | 'confirm' | 'success' | 'rejected' | 'failure' | 'cancel'
export function actionStep(phase: ActionPhase, event: ActionEvent): ActionPhase {
 if (phase === 'idle' && event === 'open') return 'confirm'
 if (phase === 'confirm' || phase === 'error') {
  if (event === 'confirm') return 'signing'
  if (event === 'cancel') return 'idle'
 }
 if (phase === 'signing') {
  if (event === 'success') return 'idle'
  if (event === 'rejected') return 'confirm'
  if (event === 'failure') return 'error'
 }
 return phase
}
export function WidgetActionDialog({ kind, name, phase, error, address = '', onCancel, onConfirm }: {
 kind: 'delete' | 'transfer'; name: string; phase: Exclude<ActionPhase, 'idle'>; error?: string | null; address?: string; onCancel(): void; onConfirm(to?: string): void
}) {
 const dialog = useRef<HTMLDivElement>(null)
 const title = useId(), body = useId(), input = useId(), feedback = useId()
 const [to, setTo] = useState(''), [attempted, setAttempted] = useState(false)
 const busy = phase === 'signing', label = kind === 'delete' ? 'Delete' : 'Transfer'
 const inputError = kind === 'transfer' && attempted ? transferAddressError(to, address) : null
 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null
  dialog.current?.querySelector<HTMLElement>('input, button')?.focus()
  return () => previous?.focus()
 }, [])
 function confirm() {
  if (busy) return
  setAttempted(true)
  if (kind === 'transfer' && transferAddressError(to, address)) return
  onConfirm(kind === 'transfer' ? to.trim() : undefined)
 }
 return <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--surface) 70%, transparent)' }}>
  <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={title} aria-describedby={body} aria-busy={busy} tabIndex={-1} style={{ width: 'calc(100% - 32px)', maxWidth: 380, padding: 24, background: 'var(--card)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-pop)' }} onKeyDown={event => {
   if (event.key === 'Escape') { event.preventDefault(); if (!busy) onCancel() }
   if (event.key !== 'Tab') return
   const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)'))
   event.preventDefault()
   if (!controls.length) { dialog.current?.focus(); return }
   const index = controls.indexOf(document.activeElement as HTMLElement)
   controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus()
  }}>
   <h2 id={title}>{label} “{name}”?</h2>
   <p id={body}>{kind === 'delete' ? 'It disappears from Arkiv now. Dashboards that use it show it as expired. Your wallet signs and pays a small network fee.' : 'The new owner can extend, transfer or delete it. You stay the author, but you can no longer delete it or save new versions.'}</p>
   {kind === 'transfer' && <div><label htmlFor={input}>New owner address</label><input id={input} placeholder="0x…" value={to} onChange={event => setTo(event.target.value)} disabled={busy} aria-invalid={!!inputError} aria-describedby={inputError ? feedback : undefined} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); confirm() } }}/>{inputError && <p id={feedback} className="error" role="alert">{inputError}</p>}</div>}
   {phase === 'error' && <p className="error" role="alert">{error ?? "Your wallet couldn't sign. Try again."}</p>}
   <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>{busy ? 'Waiting for wallet…' : label}</button></div>
  </div>
 </div>
}

// Both owner surfaces share the same signing and error transitions.
export function WidgetOwnerActions({ widgetKey, name, address, disabledReason, transfer = false, onDeleted, onTransferred, onSigned }: {
 widgetKey: string; name: string; address: string; disabledReason?: string; transfer?: boolean; onDeleted?(r: DirectResult): void; onTransferred?(r: DirectResult, to: string): void; onSigned?(): void
}) {
 const auth = useDashAuth()
 const [kind, setKind] = useState<'delete' | 'transfer'>('delete')
 const [phase, setPhase] = useState<ActionPhase>('idle')
 const [error, setError] = useState<string | null>(null)
 const busy = useRef(false)
 function open(value: typeof kind) { setKind(value); setError(null); setPhase(p => actionStep(p, 'open')) }
 async function confirm(to?: string) {
  if (busy.current || disabledReason || (phase !== 'confirm' && phase !== 'error')) return
  busy.current = true; setError(null); setPhase(p => actionStep(p, 'confirm'))
  let result: DirectResult
  try { result = await auth.sign(c => kind === 'delete' ? deleteWidgetDirect(c, widgetKey) : transferWidgetDirect(c, widgetKey, to ?? '')) }
  catch (error) {
   const reason = walletErrorKind(error)
   setError(walletErrorMessage(reason)); setPhase(p => actionStep(p, reason === 'rejected' ? 'rejected' : 'failure'))
   return
  } finally { busy.current = false; onSigned?.() }
  setPhase(p => actionStep(p, 'success'))
  if (kind === 'delete') onDeleted?.(result)
  else onTransferred?.(result, to!)
 }
 return <><button type="button" className="btn btn-quiet" title={disabledReason} disabled={!!disabledReason} onClick={() => open('delete')}>Delete widget</button>{transfer && <button type="button" className="btn btn-quiet" title={disabledReason} disabled={!!disabledReason} onClick={() => open('transfer')}>Transfer</button>}{phase !== 'idle' && <WidgetActionDialog kind={kind} name={name} phase={phase} address={address} error={error} onCancel={() => setPhase(p => actionStep(p, 'cancel'))} onConfirm={to => void confirm(to)}/>}</>
}
