import { DashboardBrowseCard } from '../explore/DashboardBrowseCard'
import type { WidgetEntity } from '../../lib/dash/entities'
import { editedAgo, type HomeDashboard } from '../../lib/dash/home'
import { TimeLeft } from './TimeLeft'
import s from '../explore/explore.module.css'

/** /me dashboard card: the Explore card with "edited Xh ago" in the facts and the Syncing note right after a write. `user` is the signed in author. */
export function DashboardCard({ item, user, head, coverPayload }: { item: HomeDashboard; user: string; head?: number; coverPayload?: WidgetEntity | null }) {
 const expiresAt = item.expiresAt ?? 0
 return <DashboardBrowseCard item={{ key: item.key, title: item.title, user, owner: user, official: false, widgets: item.widgets, charts: item.charts ?? [], createdAt: 0, updatedAt: item.updatedAt ?? 0, expiresAt, cover: item.cover ?? null }} head={head} description={null} coverPayload={coverPayload}
  facts={<>{item.widgets} {item.widgets === 1 ? 'widget' : 'widgets'} · {editedAgo(item.updatedAt, head)}</>} lifetime={item.expiresAt === undefined ? null : <TimeLeft expiresAt={expiresAt} head={head}/>}>
  {item.syncing && <div className={s.syncNote}><span className="chip chip-info"><span className="spinner" aria-hidden="true" style={{ width: 10, height: 10, borderWidth: 1.5 }}/>Syncing</span><span role="status" aria-live="polite">Saved to Arkiv. The index catches up in a few seconds.</span></div>}
 </DashboardBrowseCard>
}
