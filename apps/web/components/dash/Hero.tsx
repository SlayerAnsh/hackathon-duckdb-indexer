'use client'
import Link from 'next/link'
import type { Manifest } from '@asi/core'
import { useTimedQuery } from '../../lib/use-query'
import { compact, formatMs } from '../../lib/format'
import { FIGURE_SQL, averageMs, readFigure, type LandingStats } from '../landing/stats'
import s from '../landing/landing.module.css'

// Attributes are fetched newest first after startup; until then those entities are counted as pending.
export function FillProgress({manifest}:{manifest?:Manifest}) { if(!manifest?.pending) return null; return <p className={`hero-fill ${s.fill}`} role="status">Loading attributes: {manifest.pending.toLocaleString('en-US')} of {(manifest.live??manifest.pending).toLocaleString('en-US')} entities pending, newest first</p> }

const FIGURES: { id: keyof LandingStats; label: string; share?: boolean }[] = [
 { id: 'live', label: 'Live entities' },
 { id: 'creators', label: 'Distinct creators' },
 { id: 'expiring', label: 'Expiring within 1 hour', share: true },
 { id: 'created', label: 'Created in the last hour', share: true },
]

type Partial4<T> = { [K in keyof LandingStats]?: T }

export function HeroFigures({ stats, times }: { stats?: Partial4<number>; times?: Partial4<number> }) {
 const avg = averageMs(FIGURES.map(f => times?.[f.id]))
 return <div className={s.figuresWrap}><dl className={s.figures} aria-busy={!stats}>{FIGURES.map((f, i) => {
  const value = stats?.[f.id]
  const live = stats?.live
  const share = f.share && live ? Math.min(1, (value ?? 0) / live) : undefined
  const ms = times?.[f.id]
  return <div key={f.id} className={s.figure}>
   <dt className={s.figureLabel}><i className={s.dot} style={{ background: `var(--c${i + 1})` }} aria-hidden="true"/>{f.label}</dt>
   <dd className={s.figureValue}>{value === undefined ? '…' : compact(value)}</dd>
   <dd className={s.figureMs}><span aria-hidden="true">ϟ</span> {ms === undefined ? '…' : formatMs(ms)}</dd>
   {f.share && <dd className={s.meter} title={share === undefined ? undefined : `${Math.round(share * 100)}% of live entities`}><span style={{ width: `${(share ?? 0) * 100}%`, background: `var(--c${i + 1})` }}/></dd>}
  </div>
 })}</dl>
 <p className={s.avg}><span className={s.ms}><span aria-hidden="true">ϟ</span>{avg === undefined ? '…' : 'avg ' + formatMs(avg)}</span> per query, measured in this tab</p></div>
}

const STEPS = [
 { name: 'Arkiv chain', note: 'Tiramisu testnet' },
 { name: 'Public logs', note: 'Replayed with no API key' },
 { name: 'Indexer', note: 'Self hosted, read only' },
 { name: 'Parquet snapshot + delta', note: 'Versioned files' },
]

export function Pipeline({ ms }: { ms?: number }) {
 return <figure className={s.pipe}>
  <figcaption className={s.pipeCap}>How a row reaches this tab</figcaption>
  <ol className={s.steps}>
   {STEPS.map((step, i) => <li key={step.name} className={s.step}><span className={s.stepN}>{i + 1}</span><span className={s.stepText}><b>{step.name}</b><span>{step.note}</span></span></li>)}
   <li className={`${s.step} ${s.stepLast}`}><span className={s.stepN}>5</span><span className={s.stepText}><b>DuckDB in your browser</b><span><span className={s.ms}><span aria-hidden="true">ϟ</span>{ms === undefined ? '…' : 'avg ' + formatMs(ms)}</span> per query above</span></span></li>
  </ol>
 </figure>
}

export function Hero({version,manifest}:{version:number;manifest?:Manifest}) {
 const live = useTimedQuery(FIGURE_SQL.live, version), creators = useTimedQuery(FIGURE_SQL.creators, version)
 const expiring = useTimedQuery(FIGURE_SQL.expiring, version), created = useTimedQuery(FIGURE_SQL.created, version)
 const qs = { live, creators, expiring, created }
 const stats: Partial4<number> = {}, times: Partial4<number> = {}
 for (const id of Object.keys(qs) as (keyof LandingStats)[]) { stats[id] = readFigure(qs[id].data); if (qs[id].data) times[id] = qs[id].ms }
 const error = Object.values(qs).find(q => q.error)?.error
 return <section className={s.hero} aria-labelledby="hero-h">
  <div className={s.heroGrid}>
   <div className={s.intro}>
    <p className={s.eyebrow}>Read only SQL index for Arkiv</p>
    <h1 id="hero-h" className={s.title}>Ask live Arkiv data anything, in SQL.</h1>
    <p className={s.pitch}>Every live entity is loaded into DuckDB in this tab. Join, group and window them in milliseconds, with no 200 row pages.</p>
    <div className={s.ctas}><Link className="btn btn-primary btn-lg" href="/showcase">Explore showcase</Link><Link className="btn btn-lg" href="/playground">Open playground</Link></div>
   </div>
   <HeroFigures stats={stats} times={times}/>
  </div>
  <Pipeline ms={averageMs(Object.values(times))}/>
  {error && <p className="error">{error}</p>}
  <FillProgress manifest={manifest}/>
 </section>
}
