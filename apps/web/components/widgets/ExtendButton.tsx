'use client'
import { useEffect, useRef, useState } from 'react'
import { useDashAuth } from '../auth/DashAuthProvider'
import { dashApi } from '../../lib/dash/api'
import { withSession } from '../../lib/dash/auth-client'
import { addPending } from '../../lib/dash/pending'
import type { LifetimeDays, WriteResult } from '../../lib/dash/schema'
import { extendPreview } from '../../lib/dash/time'
import { useIndex } from '../../lib/use-index'
import { ExtendDialog } from './ExtendDialog'

export type ExtendPhase = 'idle' | 'confirm' | 'extending' | 'done' | 'error'
type ExtendEvent = 'click' | 'confirm' | 'cancel' | 'timeout' | 'escape' | 'success' | 'failure' | 'settled'
export function extendStep(phase: ExtendPhase, event: ExtendEvent): ExtendPhase {
 if (phase === 'idle' && event === 'click') return 'confirm'
 if (phase === 'confirm' || phase === 'error') {
  if (event === 'confirm') return 'extending'
  if (event === 'cancel' || event === 'escape' || event === 'timeout') return 'idle'
 }
 if (phase === 'extending' && event === 'success') return 'done'
 if (phase === 'extending' && event === 'failure') return 'error'
 if (phase === 'done' && event === 'settled') return 'idle'
 return phase
}
export function ExtendButton({ widgetKey, expiresAt, head: suppliedHead, lifetimeDays, canExtend, onExtended, label = 'Extend' }: {
 widgetKey: string; expiresAt: number; head?: number; lifetimeDays: LifetimeDays; canExtend: boolean; label?: string; onExtended?(r: WriteResult): void
}) {
 const auth = useDashAuth()
 const { state } = useIndex()
 const head = suppliedHead ?? state.liveHead
 const [phase, setPhase] = useState<ExtendPhase>('idle')
 const [optimistic, setOptimistic] = useState<{ key: string; expiresAt: number } | null>(null)
 const busy = useRef(false)
 const button = useRef<HTMLButtonElement>(null)
 const expiry = optimistic?.key === widgetKey ? Math.max(expiresAt, optimistic.expiresAt) : expiresAt
 useEffect(() => {
  if (phase !== 'done') return
  const timer = setTimeout(() => setPhase(p => extendStep(p, 'settled')), 3000)
  return () => clearTimeout(timer)
 }, [phase])
 function close() { setPhase(p => extendStep(p, 'cancel')); button.current?.focus() }
 async function confirm() {
  if (busy.current || head === undefined || !canExtend || expiry <= head) return
  busy.current = true
  setPhase(p => extendStep(p, 'confirm'))
  let result: WriteResult
  try { result = await withSession(() => dashApi.extendWidget(widgetKey), auth.requestLogin) }
  catch { setPhase(p => extendStep(p, 'failure')); busy.current = false; return }
  busy.current = false
  if (result.expiresAt !== undefined) setOptimistic({ key: widgetKey, expiresAt: result.expiresAt })
  addPending({ key: widgetKey, kind: 'widget', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: result.expiresAt === undefined ? undefined : { expiresAt: result.expiresAt } })
  setPhase(p => extendStep(p, 'success'))
  button.current?.focus()
  onExtended?.(result)
 }
 if (!canExtend || (head !== undefined && expiry <= head)) return null
 const atCap = head !== undefined && extendPreview(expiry, head, lifetimeDays).atCap
 return <>
  <button ref={button} type="button" className="btn btn-quiet" title={atCap ? 'Already at the 90 day maximum' : undefined} disabled={atCap || head === undefined || phase === 'done'} onClick={() => setPhase(p => extendStep(p, 'click'))}>{phase === 'done' ? 'Extended ✓' : label}</button>
  {(phase === 'confirm' || phase === 'extending' || phase === 'error') && head !== undefined && <ExtendDialog expiresAt={expiry} head={head} lifetimeDays={lifetimeDays} phase={phase} onCancel={close} onConfirm={() => { void confirm() }}/>}
 </>
}
