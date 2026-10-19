import type { ReactNode } from 'react'

export type EmptyIcon = 'dashboard' | 'widget' | 'search' | 'official' | 'activity'
const ICONS: Record<EmptyIcon, ReactNode> = {
 dashboard: <><rect x="4" y="5" width="32" height="30" rx="3"/><path d="M4 13h32M14 13v22M18 20h13M18 27h9"/></>,
 widget: <><rect x="5" y="6" width="30" height="28" rx="3"/><path d="M12 27v-6M18 27V15M24 27v-9M30 27v-4"/></>,
 search: <><circle cx="18" cy="18" r="10"/><path d="m26 26 8 8M14 18h8"/></>,
 official: <><path d="M20 4 7 9v9c0 8.5 5.6 14.6 13 18 7.4-3.4 13-9.5 13-18V9Z"/><path d="m14 20 4.5 4.5L27 16"/></>,
 activity: <path d="M4 21h7l4-11 6 21 4-14 3 4h8"/>,
}
export function EmptyStateIcon({ icon }: { icon: EmptyIcon }) {
 return <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[icon]}</svg>
}
export function EmptyState({ icon, title, body, actions, compact = false }: { icon: EmptyIcon; title: string; body: string; actions?: ReactNode; compact?: boolean }) {
 return <section role="status" className={compact ? 'empty-state empty-state-compact' : 'empty-state'}>
  <span className="empty-state-icon"><EmptyStateIcon icon={icon}/></span>
  <h3 className="empty-state-title">{title}</h3>
  <p className="empty-state-body">{body}</p>
  {actions ? <div className="empty-state-actions">{actions}</div> : null}
 </section>
}
/** Placeholder card shown while the SQL list has no data yet. Never shown together with an empty state. */
export function SkeletonCards({ count, label, tall = false }: { count: number; label: string; tall?: boolean }) {
 return <>{Array.from({ length: count }, (_, i) => <div key={i} className={tall ? 'skel-card skel-card-tall' : 'skel-card'} data-skeleton="true" aria-hidden="true"><span className="skel-block"/><span className="skel-line skel-w40"/><span className="skel-line skel-w70"/><span className="skel-line skel-w30"/></div>)}<span className="sr-only" role="status">{label}</span></>
}
export const PlusIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
