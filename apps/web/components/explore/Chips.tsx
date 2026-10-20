import type { ReactNode } from 'react'
/** Small shared marks for Explore cards: the official author chip and the kept live lifetime chip. */
export const ShieldIcon = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 1.8 3 3.8v3.9c0 3.1 2.1 5.4 5 6.5 2.9-1.1 5-3.4 5-6.5V3.8Z"/><path d="m5.8 8 1.6 1.6L10.4 6.6"/></svg>
export const ClockIcon = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.4"/></svg>
export const CheckIcon = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>

/** Featured author mark: the chip plus the owning address, always shown. `address` renders it (a link, or plain text inside another link). */
export function OfficialAuthor({ address }: { address: ReactNode }) {
 return <><span className="chip chip-official"><ShieldIcon/>Featured</span><span>by {address}</span></>
}
/** Lifetime chip for official entities, which the app keeps alive. Same shape as TimeLeft. */
export function KeptLive() {
 return <span className="chip chip-ok"><ClockIcon/>Kept live</span>
}
