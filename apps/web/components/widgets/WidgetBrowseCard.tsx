'use client'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import type { WidgetEntity } from '../../lib/dash/entities'
import type { WidgetListItem } from '../../lib/dash/use-widget-list'
import { useInView } from '../../lib/dash/use-in-view'
import { useWidgetQuery } from '../../lib/dash/use-widget-query'
import type { TimedResult } from '../../lib/use-query'
import { AddressLink } from '../dash/AddressLink'
import { ChartIcon } from './ChartIcon'
import { CHART_LABELS } from './ChartPicker'
import { TimeLeft } from './TimeLeft'
import { WidgetPreview } from './WidgetPreview'
import s from '../showcase/showcase.module.css'

export function WidgetBrowseCard({ item, payload, head, version, variant, selected = false, disabled = false, onToggle, onAdd, visibleOverride, query }: {
 item: WidgetListItem; payload: WidgetEntity | null | undefined; head?: number; version: number; variant: 'explorer' | 'pick';
 selected?: boolean; disabled?: boolean; onToggle?(): void; onAdd?(): void; visibleOverride?: boolean; query?: TimedResult
}) {
 const [ref, seen] = useInView<HTMLElement>()
 const visible = visibleOverride ?? seen
 const result = useWidgetQuery(payload?.widget, version, visible && !!payload && query === undefined)
 const preview = query ?? result
 const pick = variant === 'pick'
 const toggle = pick && !disabled
 const style = { '--lg': 4, '--md': 6, '--sm': 12, opacity: disabled ? 0.5 : 1, borderColor: selected ? 'var(--accent)' : undefined } as CSSProperties
 return <article ref={ref} className={s.card} style={style} role={toggle ? 'button' : undefined} tabIndex={toggle ? 0 : undefined} aria-pressed={toggle ? selected : undefined}
  onClick={toggle ? onToggle : undefined} onKeyDown={toggle ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle?.() } } : undefined}>
  <div className="widget-browse-preview" style={{ height: pick ? 120 : 160, overflow: 'hidden', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
   {!visible ? <span style={{ opacity: 0.3 }}><ChartIcon type={item.chart} size={32}/></span> : payload === undefined || (!!payload && preview.loading) ? <div aria-label="Loading preview" style={{ width: '100%', height: '100%', background: 'var(--card-2)' }}/> : !payload || preview.error ? <span style={{ color: 'var(--text-3)' }}>Preview unavailable</span> : <div style={{ width: '100%', height: '100%' }}><WidgetPreview id={'browse-' + item.key} payload={payload.widget} query={preview}/></div>}
  </div>
  <style>{'.widget-browse-preview .chart-frame{height:100%;width:100%}.widget-browse-preview .recharts-cartesian-axis,.widget-browse-preview .chart-key{display:none}'}</style>
  <header className={s.head}><h3>{item.name}{pick && selected && <span aria-label="Selected"> ✓</span>}</h3><p><ChartIcon type={item.chart}/> {CHART_LABELS[item.chart]} · by <span onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><AddressLink address={item.user}/></span> · on {item.uses} {item.uses === 1 ? 'dashboard' : 'dashboards'}</p></header>
  <div className={s.body}><TimeLeft expiresAt={item.expiresAt} head={head}/>{disabled && <span>Already on this dashboard</span>}</div>
  {!pick && <footer className={s.foot}><Link className={s.action} href={'/widgets/' + item.key}>Open</Link><button type="button" className={`${s.action} ${s.primary}`} onClick={onAdd}>+ Add to dashboard</button></footer>}
 </article>
}
