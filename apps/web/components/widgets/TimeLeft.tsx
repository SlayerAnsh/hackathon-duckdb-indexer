'use client'
import { useIndex } from '../../lib/use-index'
import { timeLeftLabel } from '../../lib/dash/time'

/** Lifetime chip. Neutral while comfortably alive, warn near expiry, bad once expired. A skeleton until the chain head is known. */
export function TimeLeft({ expiresAt, head: suppliedHead }: { expiresAt: number; head?: number }) {
 const { state } = useIndex()
 const head = suppliedHead ?? state.liveHead
 if (head === undefined) return <span className="skel" data-skeleton="true" aria-hidden="true" style={{ display: 'inline-block', width: 72, height: 22, borderRadius: 'var(--r-sm)' }}/>
 const label = timeLeftLabel(expiresAt, head)
 return <span className={label.tone === 'live' ? 'chip' : `chip chip-${label.tone === 'warn' ? 'warn' : 'bad'}`}>{label.text}</span>
}
