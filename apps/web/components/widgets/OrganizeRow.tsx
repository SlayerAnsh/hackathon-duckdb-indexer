'use client'
import { StarIcon } from './StarIcon'
import type { ReactNode } from 'react'
import { useDashAuth } from '../auth/DashAuthProvider'
import { type DraftItem } from '../../lib/dash/organize-state'
import { canExtendWidget } from '../../lib/dash/widget-actions'
import { isOfficialOwned } from '../../lib/dash/official'
import { SIZES, type Size } from '../../lib/dash/schema'
import { timeLeftLabel } from '../../lib/dash/time'
import { useIndex } from '../../lib/use-index'
import { ExtendButton } from './ExtendButton'
import { KeptLive } from '../explore/Chips'
import s from './organize.module.css'

export const GripIcon = () => <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1.2"/><circle cx="8" cy="4" r="1.2"/><circle cx="4" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="8" cy="12" r="1.2"/></svg>
export const SIZE_NAMES: Record<Size, string> = { xs: 'XS', sm: 'S', md: 'M', xl: 'XL' }
export const SIZE_HINTS: Record<Size, string> = { xs: 'Quarter width', sm: 'Third width', md: 'Half width', xl: 'Full width' }
type ToolProps = { item: DraftItem; index: number; count: number; head?: number; onResize(size: Size): void; onRemove(): void; dragHandle?: ReactNode; importedUser?: string }

/** True when the widget is official, so it is kept live and has no Extend action. */
export function useOfficial(item: DraftItem, importedUser?: string): boolean {
 const auth = useDashAuth()
 return !!importedUser && !!item.owner && !!auth.config && isOfficialOwned(importedUser, item.owner, auth.config.wallet)
}

/** Strip above a tile on Organize: drag handle on the left, remove on the right. */
export function OrganizeTileHeader({ item, index, count, onRemove, dragHandle, starred = false, onStar }: { starred?: boolean; onStar?(): void } & Pick<ToolProps, 'item' | 'index' | 'count' | 'onRemove' | 'dragHandle'>) {
 return <>
  <span className={s.pill}>{dragHandle ?? <button type="button" className={s.handle} aria-label={`Reorder ${item.name}`} disabled={item.expired}><GripIcon/></button>}</span>
  <span className="sr-only">Position {index + 1} of {count}</span>
  <span className={s.pill}><button type="button" className="ib ib-sm has-tip" data-tip-pos="top" data-tip={starred ? 'Cover widget' : 'Use as cover'} aria-label={starred ? 'Cover widget' : 'Use as cover'} aria-pressed={starred} disabled={item.expired} style={starred ? { color: 'var(--accent)' } : undefined} onClick={event => { event.stopPropagation(); onStar?.() }}><StarIcon filled={starred}/></button><button type="button" className="ib ib-sm ib-danger has-tip" data-tip-pos="top" data-tip="Remove from dashboard" aria-label={`Remove ${item.name}`} onClick={event => { event.stopPropagation(); onRemove() }}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></span>
 </>
}

/** Lifetime chip with a short form ("29d") that narrow tiles show instead of the full text. */
function TileTimeLeft({ expiresAt, head: suppliedHead }: { expiresAt: number; head?: number }) {
 const { state } = useIndex()
 const head = suppliedHead ?? state.liveHead
 if (head === undefined) return <span className={`skel ${s.chipSkel}`} aria-hidden="true"/>
 const label = timeLeftLabel(expiresAt, head)
 const short = label.tone === 'live' ? label.text.split(' ')[0]! : label.tone === 'warn' ? label.text.split(' ').at(-1)! : label.text
 return <span className={label.tone === 'live' ? 'chip' : `chip chip-${label.tone === 'warn' ? 'warn' : 'bad'}`} title={label.text}>
  <span className={s.long}>{label.text}</span><span className={s.short} aria-hidden="true">{short}</span>
 </span>
}

/** Strip below a tile on Organize: size steps on the left, time left and Extend on the right. Narrow tiles get compact forms. */
export function OrganizeTileFooter({ item, head, onResize, importedUser }: Pick<ToolProps, 'item' | 'head' | 'onResize' | 'importedUser'>) {
 const auth = useDashAuth()
 const official = useOfficial(item, importedUser)
 const showExtend = !official && !item.expired && item.expiresAt !== null && item.lifetimeDays !== null
 const resize = (size: Size) => { if (item.size !== size) onResize(size) }
 return <>
  <span className={s.pill}>
   <span className={`seg seg-sm ${s.sizes}`} role="group" aria-label={`Size of ${item.name}`}>
    {SIZES.map(size => <button key={size} type="button" className="has-tip" data-tip-pos="center" data-tip={SIZE_HINTS[size]} aria-label={`${SIZE_HINTS[size]} (${SIZE_NAMES[size]})`} aria-pressed={item.size === size} disabled={item.expired}
     onClick={event => { event.stopPropagation(); resize(size) }}>{SIZE_NAMES[size]}</button>)}
   </span>
   <select className={s.sizeSelect} aria-label={`Size of ${item.name}`} value={item.size} disabled={item.expired} onClick={event => event.stopPropagation()} onChange={event => resize(event.target.value as Size)}>
    {SIZES.map(size => <option key={size} value={size}>{SIZE_NAMES[size]}</option>)}
   </select>
  </span>
  <span className={s.pill}>
   {item.expired ? <span className="state state-stale">Expired</span> : official ? <KeptLive/> : item.expiresAt !== null && <TileTimeLeft expiresAt={item.expiresAt} head={head}/>}
   {showExtend && <span className={`${s.extend} has-tip`} data-tip="Extend lifetime" data-tip-pos="center"><ExtendButton widgetKey={item.widget} expiresAt={item.expiresAt!} lifetimeDays={item.lifetimeDays!} head={head} canExtend={!!item.owner && !!auth.config && canExtendWidget({ owner: item.owner, expiresAt: item.expiresAt!, official }, head, auth.address ?? null, auth.config.wallet)}/></span>}
  </span>
 </>
}
