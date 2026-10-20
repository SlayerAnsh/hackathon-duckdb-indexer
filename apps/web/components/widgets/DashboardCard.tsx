import Link from 'next/link'
import { editedAgo, type HomeDashboard } from '../../lib/dash/home'
import s from '../explore/explore.module.css'

export function DashboardCard({ item, head }: { item: HomeDashboard; head?: number }) {
 return <Link className={s.card} style={{ textDecoration: 'none' }} href={`/d/${item.key}`}>
  <div className={s.body}><h3>{item.title}</h3>
   <div style={{ color: 'var(--text-2)' }}>{item.widgets} {item.widgets === 1 ? 'widget' : 'widgets'} · {editedAgo(item.updatedAt, head)}</div>
   {item.syncing && <><span className="state state-disk">Syncing</span><span role="status" aria-live="polite">Saved to Arkiv. The index catches up in a few seconds.</span></>}
  </div>
 </Link>
}
