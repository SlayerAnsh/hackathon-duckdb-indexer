import Link from 'next/link'
import { ArchitectureFigure } from '../about/ArchitectureFigure'
import { FEATURES, IDS, RELIES, Src } from '../about/content'
import { addressUrl } from '../../lib/explorer'
import s from './landing.module.css'

// The project story under the live demo: condensed /about sections, each ending in a link to the full version.
function Chapter({ id, title, lead, more, children }: { id: string; title: string; lead: React.ReactNode; more: React.ReactNode; children: React.ReactNode }) {
 return <section className={s.chapter} id={id} aria-labelledby={`${id}-h`}>
  <div className={s.chapterLead}>
   <h2 id={`${id}-h`}>{title}</h2>
   <p>{lead}</p>
   <p className={s.more}>{more}</p>
  </div>
  <div className={s.chapterBody}>{children}</div>
 </section>
}

export function Story() {
 return <>
  <Chapter id="problem" title="Filters you can forge, queries you cannot write" lead="Arkiv attributes are written by whoever creates the entity, and arkiv_query only filters and pages." more={<Link href="/about#who">Who this protects</Link>}>
   <div className={s.prose}>
    <p>Anyone can create an entity with <code>project = arkiv-sql-indexer-demo</code>, so a dashboard that trusts that attribute counts forged rows as its own. <code>$creator</code> is set by the chain. Scope the index with <code>$creator = addr(…)</code> and look alikes never get in.</p>
    <p><code>arkiv_query</code> returns at most 200 results per page, with no JOIN, GROUP BY or ORDER BY on attributes. Here the same data sits in DuckDB in your tab, so those queries just work.</p>
    <Src files={['README.md', 'SPECS.md', 'packages/core/src/query.ts']}/>
   </div>
  </Chapter>

  <Chapter id="pipeline" title="From the chain to your tab" lead="A self hosted indexer prepares files. Your browser runs the SQL and talks to Arkiv directly." more={<Link href="/about#how">How it works</Link>}>
   <div className={s.pipeSplit}>
    <figure className={s.archFig}><ArchitectureFigure/></figure>
    <div className={s.prose}>
     <p>A Bun indexer replays public <code>eth_getLogs</code>, fills attributes in pinned batches of at most 50 keys, and publishes versioned Parquet snapshots plus a JSON delta.</p>
     <p>A Next.js proxy serves those files. DuckDB WASM loads them, and the tab polls the public RPC for new logs and goes to it directly for payloads and verify, without an API key.</p>
     <Src files={['apps/indexer/src/fill.ts', 'apps/indexer/src/snapshot.ts', 'apps/web/lib/proxy.ts', 'apps/web/lib/live-tail.ts']}/>
    </div>
   </div>
  </Chapter>

  <Chapter id="arkiv" title="Why it has to be Arkiv" lead="The index leans on properties the chain guarantees, and keeps the rest off chain on purpose." more={<Link href="/about#why">Why Arkiv</Link>}>
   <ul className={s.relies}>{RELIES.map((r, i) => <li key={i}><b>{r.b}</b> {r.t}</li>)}</ul>
   <p className={s.offLine}>Off Arkiv on purpose: the Parquet snapshots, the DuckDB checkpoint and SQL execution. Payloads stay on chain and load on demand.</p>
   <Src files={['SPECS.md', 'arkiv/schema.md', 'apps/indexer/src/store.ts']}/>
  </Chapter>

  <Chapter id="features" title="Arkiv features you can see" lead="Each one is in the code, and each one shows up somewhere in this app." more={<><Link href="/about#use">Feature details</Link> or <Link href="/showcase">open the showcase</Link></>}>
   <ul className={s.featureList}>{FEATURES.map(f => <li key={f.title}><b>{f.title}</b><span>{f.see}</span><Src files={f.src}/></li>)}</ul>
  </Chapter>

  <Chapter id="check" title="Check it yourself" lead="Nothing here asks for trust you cannot test from a browser." more={<><Link href="/about#reproduce">Step by step</Link> or <Link href="/playground">open the playground</Link></>}>
   <ul className={s.relies}>
    <li><b>Verify any row.</b> In the playground, Verify page re-reads each row from the public RPC and labels it ok, stale, extended, expired or deleted. It is a consistency check, not a cryptographic proof.<Src files={['apps/web/lib/verify.ts', 'apps/web/components/dash/ResultsGrid.tsx']}/></li>
    <li><b>Expiry at the live head.</b> SQL views hide every entity whose expiry block is at or below the head your tab read from the RPC.<Src files={['packages/core/src/views.ts']}/></li>
    <li><b>The demo wallets are public.</b> Look them up on the Tiramisu explorer.<Src files={['README.md', 'apps/web/lib/explorer.ts']}/></li>
   </ul>
   <dl className={s.ids}>{IDS.map(i => { const url = addressUrl(i.addr); return <div key={i.addr}><dt>{i.role}</dt><dd>{url ? <a href={url} target="_blank" rel="noreferrer">{i.addr}</a> : i.addr}</dd></div> })}</dl>
  </Chapter>
 </>
}
