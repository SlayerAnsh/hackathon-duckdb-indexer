'use client'
import { useId, useRef, useState } from 'react'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
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
 const formId = useId()
 const [to, setTo] = useState(''), [attempted, setAttempted] = useState(false)
 const busy = phase === 'signing', label = kind === 'delete' ? 'Delete' : 'Transfer'
 const inputError = kind === 'transfer' && attempted ? transferAddressError(to, address) : null
 function confirm() {
  if (busy) return
  setAttempted(true)
  if (kind === 'transfer' && transferAddressError(to, address)) return
  onConfirm(kind === 'transfer' ? to.trim() : undefined)
 }
 return <Dialog open onClose={onCancel} size="sm" dismissible={!busy} title={`${label} “${name}”?`}
  description={kind === 'delete' ? 'It disappears from Arkiv now. Dashboards that use it show it as expired. Your wallet signs and pays a small network fee.' : 'The new owner can extend, transfer or delete it. You stay the author, but you can no longer delete it or save new versions.'}
  footer={<>
   <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
   <button type={kind === 'transfer' ? 'submit' : 'button'} form={kind === 'transfer' ? formId : undefined} className={`btn ${kind === 'delete' ? 'btn-danger' : 'btn-primary'}`} disabled={busy} aria-busy={busy || undefined} onClick={kind === 'delete' ? confirm : undefined}>{busy ? <><span className="spinner" aria-hidden="true"/>Waiting for wallet…</> : label}</button>
  </>}>
  {kind === 'transfer' || phase === 'error' ? <>
  {kind === 'transfer' && <form id={formId} className="field-stack" noValidate onSubmit={event => { event.preventDefault(); confirm() }}>
   <Field label="New owner address" error={inputError} hint={inputError ? undefined : 'A Rabdi address starting with 0x. Your wallet signs and pays a small network fee.'}>
    <input className="input mono" placeholder="0x…" autoComplete="off" spellCheck={false} value={to} onChange={event => setTo(event.target.value)} disabled={busy}/>
   </Field>
  </form>}
  {phase === 'error' && <p className="notice notice-bad" role="alert">{error ?? "Your wallet couldn't sign. Try again."}</p>}
  </> : null}
 </Dialog>
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
 return <><button type="button" className="btn btn-quiet btn-danger" title={disabledReason} disabled={!!disabledReason} onClick={() => open('delete')}>Delete widget</button>{transfer && <button type="button" className="btn btn-quiet" title={disabledReason} disabled={!!disabledReason} onClick={() => open('transfer')}>Transfer</button>}{phase !== 'idle' && <WidgetActionDialog kind={kind} name={name} phase={phase} address={address} error={error} onCancel={() => setPhase(p => actionStep(p, 'cancel'))} onConfirm={to => void confirm(to)}/>}</>
}
