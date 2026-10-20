/** Small stroke icons used by the playground chrome. 16px grid, currentColor. */
import type { ReactNode } from 'react'
const I = ({ size = 16, children, sw = 1.5 }: { size?: number; children: ReactNode; sw?: number }) =>
 <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
export const PlayIcon = () => <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" fill="currentColor"/></svg>
export const LinkIcon = () => <I size={14}><path d="M6.75 9.25a2.75 2.75 0 0 0 3.9 0l2.1-2.1a2.75 2.75 0 0 0-3.9-3.9l-.6.6"/><path d="M9.25 6.75a2.75 2.75 0 0 0-3.9 0l-2.1 2.1a2.75 2.75 0 0 0 3.9 3.9l.6-.6"/></I>
export const CheckIcon = () => <I size={14} sw={1.8}><path d="m3.5 8.5 3 3 6-7"/></I>
export const StopIcon = () => <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor"/></svg>
export const ListIcon = () => <I><path d="M2.5 4h11M2.5 8h11M2.5 12h7"/></I>
export const CloseIcon = () => <I sw={1.7}><path d="m4 4 8 8M12 4l-8 8"/></I>
export const SearchIcon = () => <I size={14}><circle cx="7" cy="7" r="4.5"/><path d="m13.5 13.5-3.3-3.3"/></I>
export const ChevronIcon = () => <I size={12} sw={1.8}><path d="m6 3.5 4.5 4.5L6 12.5"/></I>
export const TableIcon = () => <I size={14}><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M6 6.5v7"/></I>
