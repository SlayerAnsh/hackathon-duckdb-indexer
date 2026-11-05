'use client'
import { useEffect, useState } from 'react'
import { shortHex } from '../../lib/format'
import { formatGlm, type BalanceLevel } from '../../lib/dash/wallet'

export function signDisabledReason(level: BalanceLevel): string | undefined {
 return level === 'empty' ? 'Fund your wallet to sign' : undefined
}
export function BalanceNotice({ address, wei, level, initialCopied = false }: { address: string; wei: bigint | null; level: BalanceLevel; initialCopied?: boolean }) {
 const [copied, setCopied] = useState(initialCopied)
 useEffect(() => {
  if (!copied) return
  const timer = setTimeout(() => setCopied(false), 2000)
  return () => clearTimeout(timer)
 }, [copied])
 if (level === 'unknown' || level === 'ok') return null
 async function copy() {
  try { await navigator.clipboard.writeText(address); setCopied(true) } catch { /* Leave the label available for retry. */ }
 }
 const empty = level === 'empty'
 return <div className={`notice ${empty ? 'notice-bad' : 'notice-warn'}`} role="status">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 1.75 14.5 13.5h-13Z"/><path d="M8 6.25V9M8 11.25h.01"/></svg>
  <div>
   <p className="notice-title">{empty ? 'Your wallet has no tGLM.' : `Low balance: ${formatGlm(wei ?? BigInt(0))}.`}</p>
   <p>Extending, transferring or deleting needs at least 0.1 tGLM on Rabdi. Fund <span className="mono">{shortHex(address)}</span>.</p>
  </div>
  <button type="button" className="btn btn-sm" onClick={() => void copy()}>{copied ? '✓ Copied' : 'Copy address'}</button>
 </div>
}
