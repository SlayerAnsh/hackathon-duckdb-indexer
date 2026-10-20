import type { CSSProperties } from 'react'
import type { DraftItem } from '../../lib/dash/organize-state'
import { SIZE_SPAN } from '../../lib/dash/schema'
import { ChartIcon } from './ChartIcon'
import s from './organize.module.css'

/** Schematic of the wide screen report layout: one block per widget, sized by its span. Runs no queries. */
export function LayoutPreview({ items }: { items: DraftItem[] }) {
 return <section aria-label="Layout preview" className={s.layout}>
  {items.length === 0 && <p className={s.layoutEmpty}>Widgets appear here as you add them.</p>}
  {items.map((item, index) => <div key={item.id} className={`${s.block} ${item.chart === 'counter' ? s.blockStat : ''} ${item.expired ? s.blockExpired : ''}`} style={{ '--lg': SIZE_SPAN[item.size] } as CSSProperties}>
   <span className={s.blockHead}>{item.chart && <ChartIcon type={item.chart}/>}<span className={s.blockName}>{item.name}</span></span>
   <span className={s.blockFoot}><span>{index + 1}</span><span className={s.blockSize}>{item.size.toUpperCase()}</span></span>
  </div>)}
 </section>
}
