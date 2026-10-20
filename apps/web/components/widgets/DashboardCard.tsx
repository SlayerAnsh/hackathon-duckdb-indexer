import Link from 'next/link'
import { editedAgo, type HomeDashboard } from '../../lib/dash/home'
import s from '../explore/explore.module.css'

/** Compact "your dashboards" card on /me: title, size and last edit, plus the Syncing note right after a write. */
export function DashboardCard({ item, head }: { item: HomeDashboard; head?: number }) {
 return <Link className={`${s.card} ${s.simple}`} href={`/d/${item.key}`}>
  <div className={s.body}><h3>{item.title}</h3>
   <div className={s.simpleMeta}>{item.widgets} {item.widgets === 1 ? 'widget' : 'widgets'} · {editedAgo(item.updatedAt, head)}</div>
   {item.syncing && <div className={s.syncNote}><span className="chip chip-info"><span className="spinner" aria-hidden="true" style={{ width: 10, height: 10, borderWidth: 1.5 }}/>Syncing</span><span role="status" aria-live="polite">Saved to Arkiv. The index catches up in a few seconds.</span></div>}
  </div>
 </Link>
}
