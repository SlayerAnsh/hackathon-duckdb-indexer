'use client'
import type { CSSProperties } from 'react'
import type { WidgetEntity } from '../../lib/dash/entities'
import type { ChartType } from '../../lib/dash/schema'
import { useInView } from '../../lib/dash/use-in-view'
import { useWidgetQuery } from '../../lib/dash/use-widget-query'
import { useIndex } from '../../lib/use-index'
import type { TimedResult } from '../../lib/use-query'
import { ChartIcon } from '../widgets/ChartIcon'
import { WidgetPreview } from '../widgets/WidgetPreview'
import s from './explore.module.css'
export type CoverProps = { cover: string | null; charts: ChartType[]; payload?: WidgetEntity | null; visibleOverride?: boolean; query?: TimedResult }
export function DashboardCover({ cover, charts, payload, visibleOverride, query }: CoverProps) {
 const [ref, seen] = useInView<HTMLDivElement>()
 const { version } = useIndex()
 const visible = visibleOverride ?? seen
 const trusted = !!cover && payload?.key === cover
 const result = useWidgetQuery(trusted ? payload.widget : null, version, visible && trusted && query === undefined)
 const q = query ?? result
 const loading = !!cover && visible && (payload === undefined || (trusted && !q.error && (q.loading || !q.data)))
 const preview = visible && trusted && !q.error && !!q.data?.rows.length
 const icons = charts.slice(0, 4)
 return <div ref={ref} className={preview || loading ? s.cover : s.thumb} style={{ '--cols': Math.min(Math.max(icons.length, 1), 4) } as CSSProperties} aria-hidden="true">
  {loading ? <div className={`skel ${s.previewSkel}`} data-skeleton="true"/> : preview ? <div className={s.previewFill} data-cover-preview="true"><WidgetPreview id={'cover-' + cover} payload={payload.widget} query={q}/></div> : <div className={s.coverIcons} data-cover-icons="true">{icons.length ? icons.map((chart, i) => <span key={chart + i}><ChartIcon type={chart} size={20}/></span>) : <span className={s.thumbEmpty}>No widgets yet</span>}</div>}
 </div>
}
