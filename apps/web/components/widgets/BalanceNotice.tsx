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
 return <div className="state state-behind" role="status"><span>{level === 'empty' ? 'Your wallet has no GLM.' : `Low balance: ${formatGlm(wei ?? BigInt(0))}.`} Extending, transferring or deleting needs at least 0.1 GLM on Tiramisu. Fund {shortHex(address)}.</span> <button type="button" className="btn btn-quiet" onClick={() => void copy()}>{copied ? '✓ Copied' : 'Copy address'}</button></div>
}
