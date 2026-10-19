import type { CSSProperties } from 'react'
import type { DraftItem } from '../../lib/dash/organize-state'
import { SIZE_SPAN } from '../../lib/dash/schema'
import { ChartIcon } from './ChartIcon'
import s from '../showcase/showcase.module.css'

export function LayoutPreview({ items }: { items: DraftItem[] }) {
 return <section aria-label="Layout preview" className={s.grid}>{items.map(item => <div key={item.id} className={s.card} style={{ '--lg': SIZE_SPAN[item.size], '--md': item.size === 'xs' || item.size === 'sm' ? 6 : 12, '--sm': 12, padding: 16, minHeight: 96, opacity: item.expired ? 0.5 : 1 } as CSSProperties}>
  {item.chart && <ChartIcon type={item.chart}/>}<span>{item.name}</span><span className="quiet-chip">{item.size.toUpperCase()}</span>
 </div>)}</section>
}
