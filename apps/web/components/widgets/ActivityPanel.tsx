'use client'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { blockAge } from '../../lib/format'
import { TimeLeft } from './TimeLeft'
import h from './home.module.css'

type Counts = { live_widgets: number; live_dashboards: number; placements: number; active_days: number }
const STATS: readonly { key: keyof Counts; label: string; sub: string }[] = [
 { key: 'live_widgets', label: 'Live widgets', sub: 'Saved queries on Arkiv' },
 { key: 'live_dashboards', label: 'Live dashboards', sub: 'Public pages you own' },
 { key: 'placements', label: 'Placements', sub: 'Times your widgets appear on any dashboard' },
 { key: 'active_days', label: 'Active days', sub: 'Days with a create or edit' },
]
const kindLabel = (type: unknown) => type === 'widget' ? 'Widget' : 'Dashboard'

function ListCard({ id, title, hint, count, children }: { id: string; title: string; hint: string; count: number; children: ReactNode }) {
 return <section className={h.list} aria-labelledby={id}>
  <header className={h.listHead}><h3 id={id}>{title}{count > 0 && <span className="badge">{count}</span>}</h3><span className={h.listHint}>{hint}</span></header>
  {children}
 </section>
}
function ListEmpty({ title, body }: { title: string; body: string }) {
 return <div className={h.listEmpty} role="status"><strong>{title}</strong><p>{body}</p></div>
}

export function ActivityPanel({ counts, expiring, recent, head, renderExtend }: { counts: Counts | null; expiring: unknown[][]; recent: unknown[][]; head?: number; renderExtend?(key: string): ReactNode }) {
 const href = (key: unknown, type: unknown) => `${type === 'widget' ? '/widgets/' : '/d/'}${String(key)}`
 return <section className={h.section} aria-labelledby="home-activity">
  <header className={h.head}><div className={h.headText}><h2 id="home-activity">My activity</h2><p>Counts cover live entities only.</p></div></header>
  <dl className={h.stats} aria-busy={counts === null || undefined}>
   {STATS.map(({ key, label, sub }) => {
    const value = counts?.[key]
    return <div className={h.stat} key={key}>
     <dt>{label}</dt>
     <dd>{value === undefined ? <><span className={`skel ${h.statSkel}`} aria-hidden="true"/><span className="sr-only">Loading</span></> : <span className={`${h.statValue}${value === 0 ? ' ' + h.statZero : ''}`}>{value.toLocaleString('en-US')}</span>}<span className={h.statSub}>{sub}</span></dd>
    </div>
   })}
  </dl>
  <div className={h.lists}>
   <ListCard id="home-expiring" title="Expiring soon" hint="next 24h" count={expiring.length}>
    {expiring.length ? <ul className={h.rows}>{expiring.map(([key, type, label, expiry]) => <li className={h.row} key={String(key)}>
     <div className={h.rowMain}><Link className={h.rowName} href={href(key, type)}>{String(label)}</Link><span className={h.rowKind}>{kindLabel(type)}</span></div>
     <div className={h.rowEnd}><TimeLeft expiresAt={Number(expiry)} head={head}/>{type === 'widget' && renderExtend?.(String(key))}</div>
    </li>)}</ul> : <ListEmpty title="Nothing expiring soon" body="Widgets and dashboards close to expiry show up here so you can extend them in time."/>}
   </ListCard>
   <ListCard id="home-recent" title="Recent" hint="last 10 changes" count={recent.length}>
    {recent.length ? <ul className={h.rows}>{recent.map(([key, type, label, kind, updated]) => <li className={h.row} key={String(key)}>
     <div className={h.rowMain}><Link className={h.rowName} href={href(key, type)}>{String(label)}</Link><span className={h.rowKind}>{kindLabel(type)}</span></div>
     <div className={h.rowEnd}><span className={kind === 'Created' ? 'chip chip-info' : 'chip'}>{String(kind)}</span><span className={h.rowTime}>{head === undefined ? 'just now' : `${blockAge(Number(updated), head).replaceAll(' ', '')} ago`}</span></div>
    </li>)}</ul> : <ListEmpty title="No activity yet" body="Creating or editing a widget or dashboard adds it here."/>}
   </ListCard>
  </div>
 </section>
}
