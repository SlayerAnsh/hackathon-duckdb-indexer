import type { ReactNode } from 'react'
import s from './explore.module.css'

/**
 * Shared Explore toolbar. Row one: search, sort, toggles, then the primary action pushed right.
 * Row two: filters on the left, the result count on the right (left when there are no filters).
 * Under 720px the search shares row one with an icon only primary action and the rest wraps below.
 */
export function Toolbar({ children, filters, count }: { children: ReactNode; filters?: ReactNode; count?: ReactNode }) {
 return <div className={s.toolbar}>
  <div className={s.row}>{children}</div>
  {(filters || count) && <div className={s.filterRow}>{filters}{count ? <span className={s.count} role="status">{count}</span> : null}</div>}
 </div>
}
export function SearchField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
 return <label className={`input-group ${s.searchBox}`}><span className="adorn"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg></span>
  <input type="search" aria-label={label} placeholder={label} value={value} onChange={e => onChange(e.target.value)}/></label>
}
export function ToggleChip({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
 return <label className={`switch-chip ${s.toggle}`}><input type="checkbox" role="switch" className="switch" checked={checked} onChange={e => onChange(e.target.checked)}/>{label}</label>
}
/** Sort or filter select styled for the toolbar. */
export function ToolbarSelect({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
 return <select {...props} className={`select ${s.select} ${className}`}/>
}
/** Primary toolbar action label; collapses to the icon on phones. */
export function PrimaryLabel({ children }: { children: ReactNode }) {
 return <span className={s.primaryLabel}>{children}</span>
}
/** "38 dashboards, newest first" with the number emphasised. */
export function CountLine({ text }: { text: string }) {
 const m = /^([\d,]+)(.*)$/.exec(text)
 return m ? <><b>{m[1]}</b>{m[2]}</> : <>{text}</>
}
