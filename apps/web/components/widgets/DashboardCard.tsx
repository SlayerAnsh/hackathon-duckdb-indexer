import type { CSSProperties } from 'react'
import { editedAgo, type HomeDashboard } from '../../lib/dash/home'
import s from '../showcase/showcase.module.css'

export function DashboardCard({ item, head }: { item: HomeDashboard; head?: number }) {
 return <a className={s.card} style={{ '--lg': 4, '--md': 6, '--sm': 12, textDecoration: 'none' } as CSSProperties} href={`/d/${item.key}`}>
  <div className={s.head}><h3>{item.title}</h3></div>
  <div className={s.body} style={{ color: 'var(--text-2)' }}>{item.widgets} {item.widgets === 1 ? 'widget' : 'widgets'} · {editedAgo(item.updatedAt, head)}
   {item.syncing && <><span className="state state-disk">Syncing</span><span role="status" aria-live="polite">Saved to Arkiv. The index catches up in a few seconds.</span></>}
  </div>
 </a>
}
