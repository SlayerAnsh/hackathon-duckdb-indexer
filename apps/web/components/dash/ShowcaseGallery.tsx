'use client'
import { VIEWS } from '../../lib/views'
import { cardSpans } from '../showcase/layout'
import s from '../showcase/showcase.module.css'
import { ViewTabs } from './ViewTabs'
import { WidgetCard } from './WidgetCard'

/** View tabs plus the card grid of the selected view. `paused` and `resume` pass the live mode through to every card. `onSql` is accepted for older callers and unused: cards link to the playground. */
export function ShowcaseGallery({ version, selected, onSelect, paused, resume }: { version: number; selected: string; onSelect: (id: string) => void; onSql?: (sql: string) => void; paused?: boolean; resume?: number }) {
 const view = VIEWS.find(v => v.id === selected) ?? VIEWS[0]
 const spans = cardSpans(view.widgets)
 return <section id="showcase" aria-label="Showcase queries">
  <ViewTabs selected={view.id} onSelect={onSelect}/>
  <div role="tabpanel" id={'panel-' + view.id} aria-labelledby={'tab-' + view.id}>
   <p className={s.panelDesc}>{view.description}</p>
   <div className={s.grid}>{view.widgets.map((w, i) => <WidgetCard key={w.id} widget={w} version={version} span={spans[i]} paused={paused} resume={resume}/>)}</div>
  </div>
 </section>
}
