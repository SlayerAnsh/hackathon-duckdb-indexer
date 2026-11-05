import type { Metadata } from 'next'
import Link from 'next/link'
import { Lifecycle, Points, StepFlow } from '../../components/about/Flow'
import { ALTERNATIVES, APP_WALLET, ARCH, FRICTION, HOSTED_INDEXER_URL, IDS, OFF_CHAIN, PILLARS, REPO_URL, Src, WIDGET_LIFE, explorerUrl } from '../../components/about/content'
import s from '../../components/about/about.module.css'

export const metadata: Metadata = { title: 'About · Arkiv SQL', description: 'How Arkiv SQL Indexer runs SQL over live Arkiv data in your browser, and why it is built on Arkiv.' }

const TOC = [
 { id: 'why-sql', label: 'Why SQL over Arkiv' },
 { id: 'pillars', label: 'Who this protects' },
 { id: 'why-arkiv', label: 'Why Arkiv' },
 { id: 'architecture', label: 'Architecture' },
 { id: 'self-host', label: 'Run your own indexer' },
 { id: 'entities', label: 'Entity model' },
 { id: 'ownership', label: 'Who owns what' },
 { id: 'expiry', label: 'Expiry and lifetimes' },
 { id: 'verify', label: 'Verify a row' },
 { id: 'reproduce', label: 'Reproduce it' },
 { id: 'evidence', label: 'On chain evidence' },
 { id: 'limits', label: 'Limits and trust' },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
 return <section className={s.section} id={id} aria-labelledby={`${id}-h`}>
  <h2 id={`${id}-h`}>{title}</h2>
  {children}
 </section>
}

const ENTITIES = [
 { type: 'widget', attrs: ['type', 'project', 'user (addr)', 'login', 'name', 'chart'], payload: 'SQL, chart mapping, number format, chosen lifetime', life: '1, 7, 30 or 90 days' },
 { type: 'dashboard', attrs: ['type', 'project', 'user (addr)', 'login', 'title'], payload: 'Title and description', life: '90 days, renewed on each organize save' },
 { type: 'link', attrs: ['type', 'project', 'user (addr)', 'dashboard (key)', 'widget (key)'], payload: 'Size, position and a copy of the widget name', life: 'Follows its dashboard' },
]

const VERIFY = [
 { label: 'ok', tone: 'chip-ok', text: 'The chain has the same last update and expiry as your copy.' },
 { label: 'extended', tone: 'chip-info', text: 'The chain holds a newer update with a later expiry.' },
 { label: 'stale', tone: 'chip-warn', text: 'The chain holds a different version than your copy.' },
 { label: 'expired', tone: 'chip-bad', text: 'The expiry block on chain is at or below the live head.' },
 { label: 'deleted', tone: 'chip-bad', text: 'The RPC no longer returns the entity. This cannot tell deletion from expiry.' },
]

export default function AboutPage() {
 return <main id="main" className={`wrap ${s.main}`}>
  <header className={s.hero}>
   <p className={s.eyebrow}>About</p>
   <h1 className={s.title}>How Arkiv SQL works</h1>
   <p className={s.lead}>Two parts. An open source indexer that anyone can self host, and this app, which runs on a hosted instance that indexes all Arkiv data on the Rabdi testnet. This page explains both, and how to check each claim yourself.</p>
   <p className={s.facts}>MIT licensed. Built for Arkiv: Global Tour Stop, within the challenge window of 9 October 2026 to the extended deadline of 20 October 2026, on the Tiramisu testnet (chain 7738577) with Arkiv SDK 0.8.1. The git history runs from 18 to 20 October 2026; pre-existing work: none. <a href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a></p>
  </header>

  <div className={s.layout}>
   <nav className={s.toc} aria-label="On this page">
    <p className={s.tocTitle}>On this page</p>
    <ol>{TOC.map(t => <li key={t.id}><a href={`#${t.id}`}>{t.label}</a></li>)}</ol>
   </nav>

   <article className={s.article}>
    <Section id="why-sql" title="Why SQL over Arkiv">
     <p><code>arkiv_query</code> filters and pages. It returns at most 200 results per page, newest first, with no JOIN, no GROUP BY, no ORDER BY on attributes and no aggregation beyond a count. That answers &ldquo;give me this entity&rdquo;. It does not answer &ldquo;which wallets create the most entities?&rdquo;</p>
     <div className={s.compare}>
      <div className={s.compareCell}>
       <h3>With arkiv_query</h3>
       <ol className={s.plain}>
        <li>Page through every live entity, 200 per call, on a shared rate limited budget.</li>
        <li>Collect the creator of each one in your own code.</li>
        <li>Count, sort and keep the top ten yourself.</li>
       </ol>
      </div>
      <div className={s.compareCell}>
       <h3>With SQL here</h3>
       <pre className={s.code} aria-label="Example query"><code>
        <span className="sx-kw">SELECT</span> creator, <span className="sx-fn">count</span>(*) <span className="sx-kw">AS</span> n{'\n'}
        <span className="sx-kw">FROM</span> entities{'\n'}
        <span className="sx-kw">GROUP BY</span> creator{'\n'}
        <span className="sx-kw">ORDER BY</span> n <span className="sx-kw">DESC</span>{'\n'}
        <span className="sx-kw">LIMIT</span> <span className="sx-num">10</span>
       </code></pre>
       <p className={s.note}>Runs in milliseconds in your tab. It is the Top 10 creators chart on a featured dashboard.</p>
      </div>
     </div>
     <p>SQL also fixes a trust problem. Attributes are written by whoever creates an entity, so anyone can create one with <code>project = arkiv-sql-indexer-dash</code>. <code>$creator</code> is set by the chain. The app reads its own entities by creator (the app wallet), so look alike entities never count as its own.</p>
     <Src files={['SPECS.md', 'packages/core/src/query.ts', 'apps/web/lib/dash/sql.ts']}/>
    </Section>

    <Section id="pillars" title="Who this protects">
     <p>The project enters two tracks, Open Source and Security. For each one: who is stuck or misled today, and what changes for them from the first day.</p>
     {PILLARS.map(p => <div key={p.name} className={s.pillar}>
      <h3>{p.name}</h3>
      <dl className={s.parts}>
       <div><dt>Who</dt><dd>{p.who}</dd></div>
       <div><dt>Today</dt><dd>{p.today}</dd></div>
       <div><dt>What changes</dt><dd>{p.change}</dd></div>
      </dl>
      <Src files={p.src}/>
     </div>)}
     <p>Check the Security claim yourself: the query <code>project = str(&apos;arkiv-sql-indexer-dash&apos;) AND NOT ($creator = addr({APP_WALLET}))</code> returned no entities on 20 October 2026. Anything it ever returns is ignored by this app.</p>
    </Section>

    <Section id="why-arkiv" title="Why Arkiv">
     <p>Arkiv moves the trust point from a database operator to the public chain. With an ordinary database you trust whoever runs it to say which rows exist, who wrote them and when they expire. Here those facts are chain state: the chain sets <code>$creator</code> and <code>$owner</code>, enforces the expiry block, and logs every create, patch, extend, transfer and delete publicly.</p>
     <Points items={[
      { title: 'Completeness', text: 'Anyone can replay the public logs from block zero without an API key, or run the MIT indexer, and compare the result with the hosted files.' },
      { title: 'Freshness', text: 'Verify rereads rows from an RPC node. Anyone can choose the RPC endpoint, self host this app, or run their own node.' },
      { title: 'Still trusted', text: <>Verify trusts the RPC node it asks, since <code>eth_getProof</code> is not available. Choosing your own node moves that trust to a party you pick; it does not remove it.</> },
     ]}/>
     <div className={s.tableWrap}>
      <table className={s.table}>
       <thead><tr><th scope="col">Instead of Arkiv</th><th scope="col">What breaks</th></tr></thead>
       <tbody>{ALTERNATIVES.map(a => <tr key={a.alt}><th scope="row">{a.alt}</th><td>{a.breaks}</td></tr>)}</tbody>
      </table>
     </div>
     <h3 className={s.subhead}>What stays off Arkiv on purpose</h3>
     <div className={s.tableWrap}>
      <table className={s.table}>
       <thead><tr><th scope="col">Kept off chain</th><th scope="col">Why</th></tr></thead>
       <tbody>{OFF_CHAIN.map(o => <tr key={o.what}><th scope="row">{o.what}</th><td>{o.why}</td></tr>)}</tbody>
      </table>
     </div>
     <Src files={['README.md', 'test/deployment.test.ts', 'apps/indexer/src/snapshot.ts']}/>
    </Section>

    <Section id="architecture" title="Architecture">
     <p>The indexer turns the chain into files. The browser turns the files into a database and keeps it current.</p>
     <figure className={s.fig}><StepFlow label="Architecture from the Arkiv RPC to DuckDB in the browser" steps={ARCH}/></figure>
     <dl className={s.parts}>
      <div><dt>Indexer</dt><dd>Replays public <code>eth_getLogs</code> from block zero without an API key, and writes every live entity from log data. Attributes are filled newest first with <code>$key</code> lookups of at most 50 keys, each pinned to one block with <code>atBlock</code>. Live sync applies creates, patches, extensions, transfers and deletes every 5 blocks.</dd></div>
      <div><dt>Snapshot, delta, live tail</dt><dd>A new versioned pair of Parquet files every 30 blocks, keeping the latest two. A JSON delta carries every key changed since that snapshot, and the browser polls it every 2 seconds. Between deltas, the browser tails chain logs every 4 seconds and fetches attributes for new keys at most every 20 seconds.</dd></div>
      <div><dt>DuckDB WASM</dt><dd>Merges the three sources into two views, <code>entities</code> and <code>attributes</code>. Every query runs in your tab; there is no server SQL endpoint.</dd></div>
      <div><dt><code>/data</code> proxy</dt><dd>Next.js forwards manifest, delta and Parquet requests to <code>INDEXER_URL</code> (the hosted indexer for this app, or your own), with ETags and Range support. If the indexer is down, it serves the same files from a read only mount.</dd></div>
      <div><dt>Polling, not events</dt><dd>The indexer and the browser poll <code>eth_getLogs</code> directly instead of using the SDK event watcher. That gives explicit block windows and checkpoints: the indexer commits one per batch, and the browser tail starts at <code>delta.toBlock + 1</code>, exactly where the indexer&apos;s published window ends.</dd></div>
      <div><dt><code>/api/rpc</code> proxy</dt><dd>Browser reads (live head, logs, payloads, verify) go through this same origin proxy. It allows read only methods, limits each client to 10 requests a second, and adds the server&apos;s API key when one is configured. No key ever reaches the browser.</dd></div>
     </dl>
     <Src files={['apps/indexer/src/replay.ts', 'apps/indexer/src/fill.ts', 'apps/indexer/src/sync.ts', 'apps/indexer/src/config.ts', 'apps/web/lib/proxy.ts', 'apps/web/lib/live-tail.ts', 'apps/web/app/api/rpc/route.ts']}/>
    </Section>

    <Section id="self-host" title="Run your own indexer">
     <p>The indexer is the reusable part. Point it at all of Arkiv, or at a subset with <code>INDEX_EXPRESSION</code> (for example <code>$creator = addr(…)</code>), and it publishes a manifest, snapshots and a delta that any app, script or agent can read.</p>
     <pre className={s.code} aria-label="Start the stack with Docker Compose"><code>{`git clone ${REPO_URL}.git sql-indexer
cd sql-indexer
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`}</code></pre>
     <Points items={[
      { title: 'No API key', text: 'Backfill and live sync read public logs. The key is used only when you opt in.' },
      { title: 'Plain files', text: <>Read <code>manifest.json</code>, then the Parquet files it lists, with DuckDB or any Parquet tool.</> },
      { title: 'Docker or Bun', text: 'Docker Compose for the full stack, or Bun 1.3 to run the indexer and the app directly.' },
     ]}/>
     <p>The hosted indexer behind this app serves the same files at <a href={HOSTED_INDEXER_URL} target="_blank" rel="noreferrer">{HOSTED_INDEXER_URL.replace('https://', '')}</a>, so you can query all of Rabdi with DuckDB without running anything.</p>
     <p className={s.more}><a href={`${REPO_URL}#quick-start`} target="_blank" rel="noreferrer">Full setup in the README</a></p>
     <Src files={['README.md', 'docker-compose.yml', '.env.example', 'apps/indexer/test/keyless.test.ts']}/>
    </Section>

    <Section id="entities" title="Entity model">
     <p>The app writes three entity types, each with the attribute <code>project = arkiv-sql-indexer-dash</code>. Attributes are typed and queryable. The JSON payload holds the details, stays on chain, and never enters Parquet; the Payload button loads it on demand.</p>
     <div className={s.entities}>{ENTITIES.map(e => <div key={e.type} className={s.entity}>
      <h3><code>{e.type}</code></h3>
      <dl>
       <div><dt>Attributes</dt><dd>{e.attrs.join(', ')}</dd></div>
       <div><dt>Payload</dt><dd>{e.payload}</dd></div>
       <div><dt>Lifetime</dt><dd>{e.life}</dd></div>
      </dl>
     </div>)}</div>
     <p>A dashboard holds at most 48 links and never the same widget twice. The <code>login</code> attribute records only the provider name; no email, handle or Privy user ID is written.</p>
     <Src files={['arkiv/schema.md', 'apps/web/lib/dash/schema.ts']}/>
    </Section>

    <Section id="ownership" title="Who owns what">
     <p>You log in with Privy (Google, Discord, X or Telegram) and get an embedded wallet. The app wallet creates every entity, so <code>$creator</code> stays one known address. A widget is then handed to you.</p>
     <figure className={s.fig}><Lifecycle label="Widget lifecycle" steps={WIDGET_LIFE}/></figure>
     <div className={s.tableWrap}>
      <table className={s.table}>
       <thead><tr><th scope="col">Action</th><th scope="col">Who can do it</th><th scope="col">How</th></tr></thead>
       <tbody>
        <tr><th scope="row">Save a widget</th><td>Any logged in user</td><td>Through the app, free.</td></tr>
        <tr><th scope="row">Edit a widget</th><td>Its Arkiv owner</td><td>Through the app, free. Saves a new version and repoints your dashboard links.</td></tr>
        <tr><th scope="row">Extend a widget</th><td>Any logged in user</td><td>Signed in the browser, paid in GLM. Adds its lifetime again, up to 90 days ahead.</td></tr>
        <tr><th scope="row">Delete or transfer a widget</th><td>Its Arkiv owner</td><td>Signed in the browser, paid in GLM.</td></tr>
        <tr><th scope="row">Edit a dashboard</th><td>Its owner (the <code>user</code> attribute)</td><td>Through the app. Dashboards and links stay owned by the app wallet.</td></tr>
       </tbody>
      </table>
     </div>
     <dl className={s.parts}>
      <div><dt>Why readonly</dt><dd>Once a widget is yours the app no longer controls it, so its attributes and payload are frozen for life. A new owner cannot rewrite the author, or set it to the app wallet and hand it back to fake a Featured widget. That is also why editing saves a new version.</dd></div>
      <div><dt>Why anyone can extend</dt><dd>A widget on someone else&apos;s dashboard may matter to you. Permissionless extension lets you keep it alive, paying your own fee, without being able to change it.</dd></div>
      <div><dt>Why one transaction</dt><dd>Saving creates the widget and transfers it to you in one batch, with its key predicted in advance. Either both happen or neither, so a widget is never left with the app wallet, and a new placement never points at a widget that failed to save. Organize saves a whole layout the same way.</dd></div>
     </dl>
     <p><strong>Featured</strong> dashboards and widgets belong to the app wallet itself: it is both their <code>user</code> and their Arkiv owner. The server extends them on a schedule, so they stay live.</p>
     <Src files={['arkiv/schema.md', 'apps/web/lib/dash/server/operations.ts', 'apps/web/lib/dash/server/keepalive.ts']}/>
    </Section>

    <Section id="expiry" title="Expiry and lifetimes">
     <p>Every Arkiv entity has an expiry block. The index honours it instead of keeping data forever, in three places:</p>
     <Points items={[
      { title: 'Snapshot build', text: <>Copies only rows with <code>expires_at</code> above the head.</> },
      { title: 'Indexer sweep', text: 'Deletes expired rows every batch and keeps only two snapshot versions.' },
      { title: 'Browser views', text: <>Hide rows whose expiry is at or below <code>live_head</code>, read from the RPC.</> },
     ]}/>
     <p>So a row leaves SQL the moment its block passes, with no event needed. Extending a widget adds its chosen lifetime again, capped at 90 days remaining.</p>
     <div className={s.tableWrap}>
      <table className={s.table}>
       <thead><tr><th scope="col">Entity</th><th scope="col">Lifetime</th><th scope="col">Why</th></tr></thead>
       <tbody>
        <tr><th scope="row">Widget</th><td>1, 7, 30 or 90 days, your choice</td><td>You decide how long a public query stays public. Each extend adds that lifetime again, so it lives while someone keeps renewing it. The 90 day cap is an app rule, not an Arkiv limit.</td></tr>
        <tr><th scope="row">Dashboard</th><td>90 days, renewed on every save</td><td>Editing a dashboard is the activity that keeps it alive.</td></tr>
        <tr><th scope="row">Link</th><td>Same expiry as its dashboard</td><td>A placement never outlives its dashboard or dies before it.</td></tr>
        <tr><th scope="row">Featured</th><td>90 days, kept alive by the app</td><td>A lease: every 6 hours the app wallet checks Featured entities and extends any with fewer than 30 days left back to 90. The first renewal falls due about 60 days after creation.</td></tr>
       </tbody>
      </table>
     </div>
     <p> When a widget expires or is deleted, its dashboard slot keeps the copied name and runs no SQL.</p>
     <p>An older snapshot file can hold a row until it is pruned, and someone who copied data while it was live keeps their copy. Expiry here is not a promise to erase third party copies.</p>
     <Src files={['apps/indexer/src/snapshot.ts', 'apps/indexer/src/store.ts', 'packages/core/src/views.ts']}/>
    </Section>

    <Section id="verify" title="Verify a row">
     <p>When a result has a <code>key</code> column, Verify (or Verify page for every row) asks the RPC for each key&apos;s current update block, expiry and owner, in batches of 50, and compares them with your copy:</p>
     <dl className={s.statuses}>{VERIFY.map(v => <div key={v.label}><dt><span className={`chip ${v.tone}`}>{v.label}</span></dt><dd>{v.text}</dd></div>)}</dl>
     <p>This is a consistency check against the RPC, not a cryptographic proof, because <code>eth_getProof</code> is not available on Arkiv.</p>
     <p>The chain is the reference, not the index. To see a stale copy caught, start an indexer with <code>SYNC_PAUSED=true</code> on an old data directory and run <code>examples/verify_against_chain.py</code> against it: it applies the same rule to the 50 newest rows. Recorded on 20 October 2026 at 01:58 UTC: a copy paused at block 757,400, 48,478 blocks behind, came back 45 <code>deleted</code> and 5 <code>extended</code>; the live hosted index, at snapshot block 805,871 with the chain head at 805,881, came back 50 <code>ok</code>. That second result drifts with live churn: about 2,800 keys change per hour, so a rerun can show a few <code>stale</code> or <code>extended</code> rows updated since the last snapshot. In this app the browser live tail replays chain logs on top of a paused index, so here a stale copy shows only until the tail catches up.</p>
     <Src files={['apps/web/lib/verify.ts', 'apps/web/components/dash/ResultsGrid.tsx', 'examples/verify_against_chain.py', 'apps/web/test/helpers.test.ts']}/>
    </Section>

    <Section id="reproduce" title="Reproduce it">
     <ol className={s.steps}>
      <li><span><b>Open a <Link href="/explore">featured dashboard</Link>.</b> Every chart is one SQL query run by DuckDB in your tab, with its SQL one click away.</span></li>
      <li><span><b>Open the <Link href="/playground">playground</Link> and run &ldquo;Most placed widgets&rdquo;.</b> It joins widget and link entities and counts placements, including widgets with none.</span></li>
      <li><span><b>Run <code>SELECT key, creator, owner, updated_at, expires_at FROM entities LIMIT 20</code> and press Verify page.</b> Each row is checked against the chain.</span></li>
      <li><span><b>Watch a row expire.</b> Sort by <code>expires_at</code>, wait for the chain block in the status bar to pass one, and run again. The row is gone.</span></li>
      <li><span><b>Look up the app wallet.</b> It is the creator of every app entity; see <a href="#evidence">On chain evidence</a>.</span></li>
     </ol>
     <Src files={['README.md', 'apps/web/lib/views.ts', 'apps/web/components/dash/StatusBar.tsx']}/>
    </Section>

    <Section id="evidence" title="On chain evidence">
     <p>Every value below was read back from Tiramisu on 20 October 2026. Each creation transaction was sent by the app wallet and stays on the explorer after the entity expires.</p>
     <dl className={s.ids}>{IDS.map(i => <div key={i.value}><dt>{i.role}</dt><dd>
      <a href={explorerUrl(i.kind, i.value)} target="_blank" rel="noreferrer">{i.value}</a>
      {i.tx && <span className={s.tx}>created in <a href={explorerUrl('tx', i.tx)} target="_blank" rel="noreferrer">{i.tx}</a></span>}
     </dd></div>)}</dl>
     <Src files={['README.md', 'arkiv/schema.md']}/>
    </Section>

    <Section id="limits" title="Limits and trust">
     <ul className={s.limits}>
      <li><b>Completeness.</b> Verify checks the rows you see. It cannot show a row the indexer left out; for that, run your own indexer and compare.</li>
      <li><b>The read proxy.</b> Browser RPC reads go through this server&apos;s <code>/api/rpc</code>. You trust it to forward them unchanged, or you self host.</li>
      <li><b>Filtered indexes.</b> With an <code>INDEX_EXPRESSION</code> that has no <code>$creator</code> or <code>$owner</code> term, keyless sync cannot see an existing entity that starts matching through a patch.</li>
      <li><b>One web instance.</b> Login nonces, rate limits and the app wallet queue live in memory.</li>
      <li><b>Everything is public.</b> SQL, names and dashboard content are on chain. Keep personal information out of them.</li>
     </ul>
     <h3 className={s.subhead} id="friction">Friction we measured</h3>
     <p>On Tiramisu between 18 and 20 October 2026 with SDK 0.8.1, viem 2.57.7 and Privy 3.50.0. Expected and actual behavior, versions and reproduction steps are in <code>arkiv/friction.md</code>.</p>
     <ul className={s.friction}>{FRICTION.map(f => <li key={f.h}>
      <h4>{f.h}<span className={s.measure}>{f.m}</span></h4>
      <p>{f.p}</p>
     </li>)}</ul>
     <Src files={['arkiv/friction.md', 'README.md']}/>
    </Section>
   </article>
  </div>
 </main>
}
