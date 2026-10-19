import type { ReactNode } from 'react'
import s from './explore.module.css'

/** Shared Explore toolbar: row one holds search, sort, toggles and the primary action; row two holds filters and the result count. */
export function Toolbar({ children, filters, count }: { children: ReactNode; filters?: ReactNode; count?: string | null }) {
 return <div className={s.toolbar}>
  <div className={s.row}>{children}</div>
  {(filters || count) && <div className={s.filterRow}>{filters}{count ? <span className={s.count} role="status">{count}</span> : null}</div>}
 </div>
}
export function SearchField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
 return <label className={s.searchBox}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
  <input type="search" aria-label={label} placeholder={label} value={value} onChange={e => onChange(e.target.value)}/></label>
}
export function ToggleChip({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
 return <label className={s.toggle}><input type="checkbox" role="switch" className={s.switch} checked={checked} onChange={e => onChange(e.target.checked)}/>{label}</label>
}
