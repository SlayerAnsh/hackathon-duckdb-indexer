'use client'
import { useIndex } from '../../lib/use-index'
import { timeLeftLabel } from '../../lib/dash/time'

export function TimeLeft({ expiresAt, head: suppliedHead }: { expiresAt: number; head?: number }) {
 const { state } = useIndex()
 const head = suppliedHead ?? state.liveHead
 if (head === undefined) return <span className="quiet-chip">…</span>
 const label = timeLeftLabel(expiresAt, head)
 return <span className={label.tone === 'live' ? 'quiet-chip' : `state state-${label.tone === 'warn' ? 'behind' : 'stale'}`}>{label.text}</span>
}
