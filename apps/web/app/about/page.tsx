import type { Metadata } from 'next'
import Link from 'next/link'
import { TopBar } from '../../components/dash/TopBar'
import { Footer } from '../../components/dash/Footer'
import { ArchitectureFigure } from '../../components/about/ArchitectureFigure'
import { ExpiryFigure } from '../../components/about/ExpiryFigure'
import { addressUrl } from '../../lib/explorer'
import { ELSEWHERE, FEATURES, FRICTION, HOW, IDS, OFF_ARKIV, RELIES, Src } from '../../components/about/content'
import s from '../../components/about/about.module.css'

export const metadata: Metadata = { title: 'About · Arkiv SQL', description: 'How Arkiv SQL Indexer runs SQL over live Arkiv data in your browser, and why it is built on Arkiv.' }

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: React.ReactNode }) {
 return <section className={s.section} id={id} aria-labelledby={`${id}-h`}>
  <div className={s.rail}><h2 id={`${id}-h`}>{title}</h2><p>{lead}</p></div>
  <div className={s.body}>{children}</div>
 </section>
}

export default function AboutPage() {
 return <>
  <TopBar/>
  <main className={`wrap ${s.main}`}>
   <header className={s.hero}>
    <div>
     <h1 className={s.title}>SQL over live Arkiv data, in your browser.</h1>
     <p className={s.pitch}>Arkiv SQL Indexer mirrors Arkiv entities into Parquet snapshots. Your browser loads them into DuckDB WASM for joins, grouping and window functions, follows new blocks from the public RPC, and drops each row once its expiry block passes.</p>
     <div className={s.ctas}>
      <Link className="btn btn-primary btn-lg" href="/showcase">Open the showcase</Link>
      <Link className="btn btn-lg" href="/playground">Write your own query</Link>
     </div>
     <p className={s.facts}>Open source (MIT), built 9 to 18 October 2026 for the Open Source and Security tracks. Runs on Tiramisu with Arkiv SDK 0.8.1.</p>
    </div>
    <figure className={s.query}>
     <pre aria-label="Example query"><code>
      <span className="sx-kw">SELECT</span> creator, <span className="sx-fn">count</span>(*) <span className="sx-kw">AS</span> count{'\n'}
      <span className="sx-kw">FROM</span> entities{'\n'}
      <span className="sx-kw">GROUP BY</span> creator{'\n'}
      <span className="sx-kw">ORDER BY</span> count <span className="sx-kw">DESC</span>, creator{'\n'}
      <span className="sx-kw">LIMIT</span> <span className="sx-num">10</span>
     </code></pre>
     <figcaption>The Top 10 creators chart in the showcase. <code>arkiv_query</code> filters and pages entities; it has no GROUP BY, JOIN or ORDER BY on attributes.</figcaption>
    </figure>
   </header>

   <Section id="who" title="Who this protects" lead="A dApp or analyst that filters Arkiv data by a user written attribute, such as project or type.">
    <div className={s.prose}>
     <p>Attributes are written by whoever creates the entity. Anyone can create an entity with <code>project = arkiv-sql-indexer-demo</code>, so a dashboard that trusts that attribute counts forged rows as its own. <strong>User attributes alone are not an identity boundary.</strong></p>
     <p>The usual answer is a hosted indexer or a subgraph, which asks every user to trust whoever runs it, and which typically keeps rows after the data was meant to expire.</p>
     <Src files={['README.md', 'SPECS.md']}/>
    </div>
    <div>
     <h3 className={s.subhead}>What changes from day one</h3>
     <ul className={s.changes}>
      <li><b>Rows are scoped by $creator.</b> Set <code>INDEX_EXPRESSION</code> to <code>$creator = addr(…)</code> and only that wallet&apos;s entities are indexed, including tickets later handed to another owner. Startup refuses to reuse a store built for a different expression.<Src files={['README.md', 'packages/core/src/query.ts', 'apps/indexer/src/store.ts']}/></li>
      <li><b>Any row can be checked against the chain.</b> Verify re-reads key, updated_at, expires_at and owner from the public RPC and labels the row ok, stale, extended, expired or deleted. It is a consistency check against an independent RPC, not a cryptographic proof.<Src files={['apps/web/lib/verify.ts', 'apps/web/components/dash/ResultsGrid.tsx']}/></li>
      <li><b>SQL runs in your tab.</b> There is no server SQL endpoint. No API key reaches the browser, and by default the indexer never sends one either.<Src files={['apps/indexer/src/main.ts', 'apps/indexer/test/keyless.test.ts']}/></li>
      <li><b>Expired rows leave every layer.</b> Snapshots, the indexer store and the browser views all drop entities past their expiry block.<Src files={['apps/indexer/src/snapshot.ts', 'apps/indexer/src/store.ts', 'packages/core/src/views.ts']}/></li>
     </ul>
    </div>
    <div className={s.prose}>
     <h3 className={s.subhead}>Build on it without asking</h3>
     <p>The data contract is two SQL views, <code>entities</code> and <code>attributes</code>, documented column by column in <code>arkiv/schema.md</code>. Snapshots are plain Parquet files listed in <code>/data/manifest.json</code>, readable by any Parquet tool. The code is MIT licensed, and the whole stack deploys with Docker Compose.</p>
     <Src files={['arkiv/schema.md', 'apps/web/lib/disk-data.ts', 'LICENSE', 'docker-compose.yml']}/>
    </div>
   </Section>

   <Section id="how" title="How it works" lead="A self hosted indexer prepares the files. Everything you query runs in your browser, which also talks to Arkiv directly.">
    <div className={s.figure}>
     <figure className={s.svgWrap}><ArchitectureFigure/></figure>
     <div>
      <ol className={s.steps}>{HOW.map(h => <li key={h.b}><span><b>{h.b}</b> {h.t}</span></li>)}</ol>
      <Src files={['apps/indexer/src/replay.ts', 'apps/indexer/src/fill.ts', 'apps/indexer/src/sync.ts', 'apps/indexer/src/config.ts', 'apps/web/lib/proxy.ts', 'apps/web/lib/live-tail.ts']}/>
     </div>
    </div>
   </Section>

   <Section id="why" title="Why Arkiv" lead="The project depends on properties that only hold when the data lives on Arkiv.">
    <div className={s.compare}>{ELSEWHERE.map(e => <div key={e.h} className={s.cell}><h3>{e.h}</h3><p>{e.p}</p></div>)}</div>
    <div>
     <h3 className={s.subhead}>What we rely on</h3>
     <ul className={s.relies}>{RELIES.map((r, i) => <li key={i}><b>{r.b}</b> {r.t}</li>)}</ul>
    </div>
    <div>
     <h3 className={s.subhead}>What stays off Arkiv, on purpose</h3>
     <ul className={s.off}>{OFF_ARKIV.map((r, i) => <li key={i}><b>{r.b}</b> {r.t}</li>)}</ul>
     <Src files={['SPECS.md', 'arkiv/schema.md', 'apps/indexer/src/store.ts']}/>
    </div>
   </Section>

   <Section id="use" title="How we use Arkiv" lead="Each feature below is in the code. For each: what it does, why it was chosen, and what you see.">
    <div className={s.features}>{FEATURES.map(f => <article key={f.title} className={s.feature}>
     <h3>{f.title}</h3>
     <dl>
      <div><dt>What the code does</dt><dd>{f.does}</dd></div>
      <div><dt>Why</dt><dd>{f.why}</dd></div>
      <div><dt>What you see</dt><dd>{f.see}</dd></div>
     </dl>
     <Src files={f.src}/>
    </article>)}</div>
   </Section>

   <Section id="expiry" title="Expiry, end to end" lead="Three demo entity types with different lifetimes, and three places where expired rows are removed.">
    <div className={s.figure}>
     <figure className={s.svgWrap}><ExpiryFigure/></figure>
     <div className={s.prose}>
      <p>Heartbeats disappear through expiry without any event. Comments live a day. Tickets live a week, and every new comment renews the lease.</p>
      <p>The snapshot build skips rows with <code>expires_at &lt;= head</code>. The indexer sweeps expired rows and keeps two snapshot versions. The browser filters every query against <code>live_head</code>, read directly from the RPC.</p>
      <p>An older snapshot file can still hold a row until it is pruned, but SQL hides it at expiry. Someone who copied data while it was live keeps their copy; this is not a promise to erase third party copies.</p>
      <Src files={['apps/demo-writer/src/plan.ts', 'apps/indexer/src/snapshot.ts', 'apps/indexer/src/store.ts', 'packages/core/src/views.ts', 'README.md']}/>
     </div>
    </div>
   </Section>

   <Section id="friction" title="Friction we measured" lead="Observed on Tiramisu on 18 October 2026 with SDK 0.8.1. Full reproduction steps are in arkiv/friction.md.">
    <ul className={s.friction}>{FRICTION.map(f => <li key={f.h}>
     <h3>{f.h}<span className={s.measure}>{f.m}</span></h3>
     <p>{f.p}</p>
    </li>)}</ul>
    <Src files={['arkiv/friction.md', 'apps/web/components/RowActions.tsx', 'packages/core/src/query.ts']}/>
   </Section>

   <Section id="reproduce" title="Reproduce it" lead="Five minutes in a browser. No wallet, no API key.">
    <ol className={s.steps}>
     <li><span><b>Open the <Link href="/showcase">showcase</Link>.</b> Every chart is one SQL query run by DuckDB in your tab. Each card shows its timing, and most name the clause <code>arkiv_query</code> cannot express.</span></li>
     <li><span><b>Open the <Link href="/showcase?view=creators">Creators view</Link>.</b> The Creator vs current owner table lists entities whose owner differs from their creator, such as tickets the demo wallet handed to an agent.</span></li>
     <li><span><b>Open the <Link href="/playground">playground</Link> and press Run.</b> The featured query joins open tickets with their comment counts using JOIN and GROUP BY.</span></li>
     <li><span><b>Press Verify page.</b> Each row is re-read from the public RPC and labelled ok, stale, extended, expired or deleted. Payload loads a row&apos;s payload from the chain.</span></li>
     <li><span><b>Hover the status bar.</b> It shows the indexed expression, the chain head, the browser live tail block and pending attribute fetches.</span></li>
     <li><span><b>Check the chain yourself.</b> The addresses below are on the Tiramisu explorer.</span></li>
    </ol>
    <table className={s.ids}>
     <thead><tr><th scope="col">Role</th><th scope="col">Address</th></tr></thead>
     <tbody>{IDS.map(i => { const url = addressUrl(i.addr); return <tr key={i.addr}><th scope="row">{i.role}</th><td>{url ? <a href={url} target="_blank" rel="noreferrer">{i.addr}</a> : i.addr}</td></tr> })}</tbody>
    </table>
    <Src files={['README.md', 'apps/web/lib/views.ts', 'apps/web/components/dash/ResultsGrid.tsx', 'apps/web/components/dash/StatusBar.tsx']}/>
   </Section>
  </main>
  <Footer/>
 </>
}
