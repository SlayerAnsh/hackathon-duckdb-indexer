import Link from 'next/link'
import { Lifecycle, Points, StepFlow } from '../about/Flow'
import { PIPELINE, REPO_URL, TRUST, WIDGET_LIFE } from '../about/content'
import s from './landing.module.css'

// The static part of the home page, rendered on the server: how it works, what you can build, and the closing actions.
export function SectionHead({ id, title, text, link }: { id: string; title: string; text: string; link?: React.ReactNode }) {
 return <div className={s.sectionHead}>
  <div><h2 id={id}>{title}</h2><p>{text}</p></div>
  {link}
 </div>
}

export function Story() {
 return <>
  <section className={s.section} id="how" aria-labelledby="how-h">
   <SectionHead id="how-h" title="How it works" text="A hosted indexer keeps a copy of every live entity on Rabdi. Your browser loads it and runs the SQL itself." link={<Link className={s.headLink} href="/about#architecture">Architecture <span aria-hidden="true">→</span></Link>}/>
   <StepFlow label="How a row gets from Arkiv to your dashboard" steps={PIPELINE}/>
   <div className={s.trust}><Points items={TRUST}/></div>
  </section>

  <section className={s.section} id="build" aria-labelledby="build-h">
   <SectionHead id="build-h" title="What you can build" text="Log in with Google, Discord, X or Telegram. Saving is free, and everything you publish is public."/>
   <div className={s.build}>
    <article className={s.tile}>
     <h3>Widgets</h3>
     <p>One SQL query and a chart, from tables and counters to bars, lines, donuts and histograms. Choose a lifetime of 1, 7, 30 or 90 days.</p>
    </article>
    <article className={s.tile}>
     <h3>Dashboards</h3>
     <p>Arrange your own widgets, or anyone else&apos;s, into a public report with a link to share. No login needed to view it.</p>
    </article>
    <article className={s.tile}>
     <h3>Ad hoc queries</h3>
     <p>Write SQL in the playground with schema aware autocomplete, export CSV, and verify any row against the chain.</p>
    </article>
   </div>
   <div className={s.life}>
    <h3 className={s.lifeTitle}>Every widget is an Arkiv entity in your wallet</h3>
    <Lifecycle label="Widget lifecycle" steps={WIDGET_LIFE}/>
   </div>
   <div className={`${s.ctas} ${s.buildCtas}`}>
    <Link className="btn btn-primary" href="/widgets/new">Build a widget</Link>
    <Link className="btn" href="/explore">See what others built</Link>
   </div>
  </section>
 </>
}

export function Closing() {
 return <section className={s.closing} aria-label="Next steps">
  <div className={s.panel}>
   <h2>Check it yourself</h2>
   <p>Run a query in the playground, then press Verify page. Each row is read again from the chain and marked ok, stale, extended, expired or deleted.</p>
   <div className={s.panelActions}><Link className="btn btn-primary" href="/playground">Open playground</Link><Link className="btn btn-quiet" href="/about">How it works in depth</Link></div>
  </div>
  <div className={s.panel}>
   <h2>Run your own indexer</h2>
   <p>The indexer is open source under MIT. Start it with Docker Compose or Bun, index all of Arkiv or a subset, and read its Parquet snapshots from any app.</p>
   <div className={s.panelActions}><a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a><Link className="btn btn-quiet" href="/about#self-host">Self hosting</Link></div>
  </div>
 </section>
}
