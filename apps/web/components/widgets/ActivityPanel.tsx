'use client'
import type { ReactNode } from 'react'
import { blockAge } from '../../lib/format'
import { TimeLeft } from './TimeLeft'
import { EmptyState } from './EmptyState'

type Counts = { live_widgets: number; live_dashboards: number; placements: number; active_days: number }
export function ActivityPanel({ counts, expiring, recent, head, renderExtend }: { counts: Counts | null; expiring: unknown[][]; recent: unknown[][]; head?: number; renderExtend?(key: string): ReactNode }) {
 const href = (key: unknown, type: unknown) => `${type === 'widget' ? '/widgets/' : '/d/'}${String(key)}`
 return <section><h2>My activity</h2>
  <div className="tiles">{([['live_widgets', 'Live widgets'], ['live_dashboards', 'Live dashboards'], ['placements', 'Placements'], ['active_days', 'Active days']] as const).map(([key, label]) => <div className="tile" key={key} title={key === 'placements' ? 'Times your widgets appear on any dashboard' : undefined}><span>{label}</span><strong>{counts?.[key] ?? '…'}</strong></div>)}</div>
  <div className="home-two"><section><h3>Expiring soon</h3>{expiring.length ? <ul>{expiring.map(([key, type, label, expiry]) => <li key={String(key)}><a href={href(key, type)}>{String(label)}</a> <TimeLeft expiresAt={Number(expiry)} head={head}/>{type === 'widget' && renderExtend?.(String(key))}</li>)}</ul> : <EmptyState compact icon="activity" title="Nothing expiring soon" body="Widgets and dashboards close to expiry show up here so you can extend them in time."/>}</section>
   <section><h3>Recent</h3>{recent.length ? <ul>{recent.map(([key, type, label, kind, updated]) => <li key={String(key)}><a href={href(key, type)}>{String(label)}</a> <span className={kind === 'Created' ? 'pill-created' : 'pill-patched'}>{String(kind)}</span> <span>{head === undefined ? 'just now' : `${blockAge(Number(updated), head).replaceAll(' ', '')} ago`}</span></li>)}</ul> : <EmptyState compact icon="activity" title="No activity yet" body="Creating or editing a widget or dashboard adds it here."/>}</section></div>
  <p style={{ color: 'var(--text-3)' }}>Counts cover live entities only.</p>
 </section>
}
