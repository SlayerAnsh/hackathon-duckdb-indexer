'use client'
import type { ReactNode } from 'react'
import type { DraftItem } from '../../lib/dash/organize-state'
import { SIZES, type Size } from '../../lib/dash/schema'
import { AddressLink } from '../dash/AddressLink'
import { ChartIcon } from './ChartIcon'
import { TimeLeft } from './TimeLeft'
import { ExtendButton } from './ExtendButton'
import s from './organize.module.css'

export function OrganizeRow({ item, index, count, head, onResize, onRemove, dragHandle, importedUser }: {
 item: DraftItem; index: number; count: number; head?: number; onResize(size: Size): void; onRemove(): void; dragHandle?: ReactNode; importedUser?: string
}) {
 return <div className={`${s.row} ${item.expired ? s.expired : ''} ${item.flash ? s.flash : ''}`} style={item.expired ? { opacity: 0.5 } : undefined}>
  {dragHandle ?? <button type="button" className={s.handle} aria-label={`Reorder ${item.name}`} disabled={item.expired}>⋮⋮</button>}
  <span className={s.name}>{item.chart && <ChartIcon type={item.chart}/>}<span>{item.name}</span></span>
  {item.imported && importedUser && <span className="quiet-chip">by <AddressLink address={importedUser}/></span>}
  <select aria-label={`Size of ${item.name}`} value={item.size} disabled={item.expired} onChange={event => onResize(event.target.value as Size)}>{SIZES.map(size => <option key={size} value={size}>{size.toUpperCase()}</option>)}</select>
  {item.expired ? <span className="state state-stale">Expired</span> : item.expiresAt !== null && <TimeLeft expiresAt={item.expiresAt} head={head}/>}
  {!item.expired && item.expiresAt !== null && item.lifetimeDays !== null && <ExtendButton widgetKey={item.widget} expiresAt={item.expiresAt} lifetimeDays={item.lifetimeDays} head={head} canExtend/>}
  <button type="button" className="btn btn-quiet" aria-label={`Remove ${item.name}`} onClick={onRemove}>✕</button>
  <span className={s.srOnly}>{index + 1} of {count}</span>
 </div>
}
