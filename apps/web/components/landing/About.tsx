import s from './landing.module.css'

const HOW = [
 'The indexer replays the chain logs to learn which entities exist and when they change.',
 'Attributes are filled newest first from the public RPC. No API key is needed.',
 'The result is written as a versioned Parquet snapshot plus a small JSON delta per block.',
 'Your browser loads both into DuckDB WASM and keeps following new blocks with a live tail.',
 'Any row can be checked against the chain with one click, straight from the browser.',
]

export function About() {
 return <section className={s.section} id="about" aria-labelledby="about-h">
  <div className={s.about}>
   <div className={s.aboutLead}>
    <h2 id="about-h">About the project</h2>
    <p>A self hosted, read only SQL index over Arkiv. It mirrors every live entity (or only those matching an optional query expression), and rows vanish here when they expire on chain.</p>
    <ul className={s.links}>
     <li><a href="#">Source repository</a></li>
     <li><a href="https://arkiv.network" target="_blank" rel="noreferrer">Arkiv documentation</a></li>
    </ul>
   </div>
   <div className={s.aboutBody}>
    <div className={s.block}>
     <h3>How it works</h3>
     <ol className={s.how}>{HOW.map(line => <li key={line}>{line}</li>)}</ol>
    </div>
    <div className={s.block}>
     <h3>Why SQL</h3>
     <p><code>arkiv_query</code> filters entities by attribute and returns them in pages. SQL adds joins between entities, group by over any attribute, sorting by any column and window functions such as running totals. None of these can be expressed in an <code>arkiv_query</code> filter.</p>
    </div>
    <div className={s.block}>
     <h3>Open source and security</h3>
     <p>The index is read only and nothing in the browser can write to the chain. No keys are sent to or stored in the browser. Expiry is enforced in the browser against the live chain head, so an expired entity is never shown even if the stored files are older.</p>
    </div>
   </div>
  </div>
 </section>
}
