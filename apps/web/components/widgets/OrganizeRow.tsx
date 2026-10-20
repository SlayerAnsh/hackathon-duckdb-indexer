'use client'
import type { ReactNode } from 'react'
import { useDashAuth } from '../auth/DashAuthProvider'
import { type DraftItem } from '../../lib/dash/organize-state'
import { canExtendWidget } from '../../lib/dash/widget-actions'
import { isOfficialOwned } from '../../lib/dash/official'
import { SIZES, type Size } from '../../lib/dash/schema'
import { AddressLink } from '../dash/AddressLink'
import { ChartIcon } from './ChartIcon'
import { TimeLeft } from './TimeLeft'
import { ExtendButton } from './ExtendButton'
import { ShieldIcon } from './DashboardView'
import s from './organize.module.css'

export const GripIcon = () => <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1.2"/><circle cx="8" cy="4" r="1.2"/><circle cx="4" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="8" cy="12" r="1.2"/></svg>
const SIZE_NAMES: Record<Size, string> = { xs: 'XS', sm: 'SM', md: 'MD', xl: 'XL' }

export function OrganizeRow({ item, index, count, head, onResize, onRemove, dragHandle, importedUser }: {
 item: DraftItem; index: number; count: number; head?: number; onResize(size: Size): void; onRemove(): void; dragHandle?: ReactNode; importedUser?: string
}) {
 const auth = useDashAuth()
 const official = !!importedUser && !!item.owner && !!auth.config && isOfficialOwned(importedUser, item.owner, auth.config.wallet)
 const showExtend = !official && !item.expired && item.expiresAt !== null && item.lifetimeDays !== null
 return <div className={`${s.row} ${item.expired ? s.expired : ''} ${item.flash ? s.flash : ''}`} style={item.expired ? { opacity: 0.5 } : undefined}>
  {dragHandle ?? <button type="button" className={s.handle} aria-label={`Reorder ${item.name}`} disabled={item.expired}><GripIcon/></button>}
  <span className={s.position} aria-hidden="true">{index + 1}</span>
  <div className={s.main}>
   <span className={s.name}>{item.chart && <ChartIcon type={item.chart}/>}<span>{item.name}</span></span>
   <span className={s.sub}>
    {item.imported && importedUser && <span className={s.by}>{official ? <><span className="chip chip-official"><ShieldIcon/>Official</span>Arkiv SQL Indexer</> : <>by <AddressLink address={importedUser}/></>}</span>}
    {item.expired ? <span className="state state-stale">Expired</span> : official ? <span className="chip">Kept live</span> : item.expiresAt !== null && <TimeLeft expiresAt={item.expiresAt} head={head}/>}
    {showExtend && <ExtendButton widgetKey={item.widget} expiresAt={item.expiresAt!} lifetimeDays={item.lifetimeDays!} head={head} canExtend={!!item.owner && !!auth.config && canExtendWidget({ owner: item.owner, expiresAt: item.expiresAt!, official }, head, auth.address ?? null, auth.config.wallet)}/>}
   </span>
  </div>
  <div className={s.controls}>
   <select className={s.size} aria-label={`Size of ${item.name}`} value={item.size} disabled={item.expired} onChange={event => onResize(event.target.value as Size)}>{SIZES.map(size => <option key={size} value={size}>{SIZE_NAMES[size]}</option>)}</select>
   <button type="button" className="ib ib-danger has-tip" data-tip="Remove" aria-label={`Remove ${item.name}`} onClick={onRemove}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>
  </div>
  <span className={s.srOnly}>{index + 1} of {count}</span>
 </div>
}
