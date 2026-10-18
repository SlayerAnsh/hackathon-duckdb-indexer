'use client'
import Link from 'next/link'
import type { Manifest } from '@asi/core'
import { useTimedQuery } from '../../lib/use-query'
import { compact, formatMs } from '../../lib/format'
import { LANDING_STATS_SQL, readLandingStats, type LandingStats } from '../landing/stats'
import s from '../landing/landing.module.css'

// Attributes are fetched newest first after startup; until then those entities are counted as pending.
export function FillProgress({manifest}:{manifest?:Manifest}) { if(!manifest?.pending) return null; return <p className={`hero-fill ${s.fill}`} role="status">Loading attributes: {manifest.pending.toLocaleString('en-US')} of {(manifest.live??manifest.pending).toLocaleString('en-US')} entities pending, newest first</p> }

const FIGURES: { id: keyof LandingStats; label: string; share?: boolean }[] = [
 { id: 'live', label: 'Live entities' },
 { id: 'creators', label: 'Distinct creators' },
 { id: 'expiring', label: 'Expiring within 1 hour', share: true },
 { id: 'created', label: 'Created in the last hour', share: true },
]

export function HeroFigures({ stats }: { stats?: LandingStats }) {
 return <dl className={s.figures} aria-busy={!stats}>{FIGURES.map((f, i) => {
  const value = stats?.[f.id]
  const share = f.share && stats && stats.live > 0 ? Math.min(1, (value ?? 0) / stats.live) : undefined
  return <div key={f.id} className={s.figure}>
   <dt className={s.figureLabel}><i className={s.dot} style={{ background: `var(--c${i + 1})` }} aria-hidden="true"/>{f.label}</dt>
   <dd className={s.figureValue}>{value === undefined ? '…' : compact(value)}</dd>
   {f.share && <dd className={s.meter} title={share === undefined ? undefined : `${Math.round(share * 100)}% of live entities`}><span style={{ width: `${(share ?? 0) * 100}%`, background: `var(--c${i + 1})` }}/></dd>}
  </div>
 })}</dl>
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
   <li className={`${s.step} ${s.stepLast}`}><span className={s.stepN}>5</span><span className={s.stepText}><b>DuckDB in your browser</b><span><span className={s.ms}><span aria-hidden="true">ϟ</span>{ms === undefined ? '…' : formatMs(ms)}</span> for the figures above</span></span></li>
  </ol>
 </figure>
}

export function Hero({version,manifest}:{version:number;manifest?:Manifest}) {
 const q = useTimedQuery(LANDING_STATS_SQL, version)
 return <section className={s.hero} aria-labelledby="hero-h">
  <div className={s.heroGrid}>
   <div className={s.intro}>
    <p className={s.eyebrow}>Read only SQL index for Arkiv</p>
    <h1 id="hero-h" className={s.title}>Ask live Arkiv data anything, in SQL.</h1>
    <p className={s.pitch}>Every live entity is loaded into DuckDB in this tab. Join, group and window them in milliseconds, with no 200 row pages.</p>
    <div className={s.ctas}><Link className="btn btn-primary btn-lg" href="/showcase">Explore showcase</Link><Link className="btn btn-lg" href="/playground">Open playground</Link></div>
   </div>
   <HeroFigures stats={readLandingStats(q.data)}/>
  </div>
  <Pipeline ms={q.data ? q.ms : undefined}/>
  {q.error && <p className="error">{q.error}</p>}
  <FillProgress manifest={manifest}/>
 </section>
}
