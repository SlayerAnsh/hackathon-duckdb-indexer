'use client'
import Link from 'next/link'
import type { Manifest } from '@asi/core'
import { useTimedQuery } from '../../lib/use-query'
import { compact, formatMs } from '../../lib/format'
import { FIGURE_SQL, averageMs, readFigure, type LandingStats } from '../landing/stats'
import s from '../landing/landing.module.css'

// Attributes are fetched newest first after startup; until then those entities are counted as pending.
export function FillProgress({manifest}:{manifest?:Manifest}) { if(!manifest?.pending) return null; return <p className={s.fill} role="status">Loading attributes: {manifest.pending.toLocaleString('en-US')} of {(manifest.live??manifest.pending).toLocaleString('en-US')} entities pending, newest first</p> }

const FIGURES: { id: keyof LandingStats; label: string; share?: boolean }[] = [
 { id: 'live', label: 'Live entities' },
 { id: 'creators', label: 'Distinct creators' },
 { id: 'expiring', label: 'Expiring next hour', share: true },
 { id: 'created', label: 'Created last hour', share: true },
]

type Partial4<T> = { [K in keyof LandingStats]?: T }

export function HeroFigures({ stats, times, manifest }: { stats?: Partial4<number>; times?: Partial4<number>; manifest?: Manifest }) {
 const avg = averageMs(FIGURES.map(f => times?.[f.id]))
 return <div className={s.figuresWrap}><dl className={s.figures} aria-busy={!stats}>{FIGURES.map((f, i) => {
  const value = stats?.[f.id]
  const live = stats?.live
  const share = f.share && live ? Math.min(1, (value ?? 0) / live) : undefined
  const ms = times?.[f.id]
  return <div key={f.id} className={s.figure}>
   <dt className={s.figureLabel}><i className={s.dot} style={{ background: `var(--c${i + 1})` }} aria-hidden="true"/>{f.label}</dt>
   <dd className={s.figureValue}>{value === undefined ? <><span className={`skel ${s.valueSkel}`} aria-hidden="true"/><span className="sr-only">Loading</span></> : compact(value)}</dd>
   <dd className={s.figureMs}>{ms === undefined ? <span className={`skel ${s.msSkel}`} aria-hidden="true"/> : <><span className="sr-only">Query time </span>{formatMs(ms)}</>}</dd>
   {f.share && <dd className={s.meter} title={share === undefined ? undefined : `${Math.round(share * 100)}% of live entities`}><span style={{ width: `${(share ?? 0) * 100}%`, background: `var(--c${i + 1})` }}/></dd>}
  </div>
 })}</dl>
 <p className={s.avg}>{avg === undefined ? 'Measuring query time in this tab' : <><span className={s.ms}>avg {formatMs(avg)}</span>per query, measured in this tab</>}</p>
 <FillProgress manifest={manifest}/></div>
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
   <li className={`${s.step} ${s.stepLast}`}><span className={s.stepN}>5</span><span className={s.stepText}><b>DuckDB in your browser</b><span>{ms === undefined ? 'Runs every query above' : <><span className={s.ms}>avg {formatMs(ms)}</span> per query above</>}</span></span></li>
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
    <h1 id="hero-h" className={s.title}>Explore live Arkiv data, in SQL.</h1>
    <p className={s.pitch}>Browse dashboards the community builds on Arkiv, open any chart to see its SQL, or write your own. Every query runs in DuckDB in this tab.</p>
    <div className={s.ctas}><Link className="btn btn-primary btn-lg" href="/explore">Explore dashboards <span aria-hidden="true">→</span></Link><Link className="btn btn-lg" href="/playground">Open playground</Link></div>
   </div>
   <HeroFigures stats={stats} times={times} manifest={manifest}/>
  </div>
  {error && <p role="alert" className={`notice notice-bad ${s.error}`}>{error}</p>}
  <Pipeline ms={averageMs(Object.values(times))}/>
 </section>
}
