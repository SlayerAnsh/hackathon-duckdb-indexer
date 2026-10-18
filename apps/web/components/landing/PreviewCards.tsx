import Link from 'next/link'
import { WhySqlStrip } from '../dash/WhySqlStrip'
import s from './landing.module.css'

// A tiny static SQL sample, highlighted with the shared syntax tokens.
function SqlSample() {
 return <pre className={s.sample} aria-label="Example query"><code>
  <span className="sx-kw">SELECT</span> creator, <span className="sx-fn">count</span>(*) <span className="sx-kw">AS</span> n{'\n'}
  <span className="sx-kw">FROM</span> entities{'\n'}
  <span className="sx-kw">GROUP BY</span> creator{'\n'}
  <span className="sx-kw">ORDER BY</span> n <span className="sx-kw">DESC</span>
 </code></pre>
}

export function PreviewCards() {
 return <section className={s.section} aria-labelledby="explore-h">
  <div className={s.sectionHead}><h2 id="explore-h">Explore</h2><p>Start from ready made views, or write your own query.</p></div>
  <div className={s.cards}>
   <article className={s.card}>
    <p className={s.cardKicker}>Showcase</p>
    <h3 className={s.cardTitle}>Charts built from one SQL query each</h3>
    <p className={s.cardText}>Expiry horizons, top creators, attribute usage and activity. Open the SQL behind any chart and edit it in the playground.</p>
    <WhySqlStrip className={s.chips}/>
    <Link className={s.cardLink} href="/showcase">Explore showcase <span aria-hidden="true">→</span></Link>
   </article>
   <article className={s.card}>
    <p className={s.cardKicker}>Playground</p>
    <h3 className={s.cardTitle}>Your own SQL, run in this tab</h3>
    <p className={s.cardText}>Query <code>entities</code> and <code>attributes</code> with autocomplete, history, CSV export and a one click check of any row on chain.</p>
    <SqlSample/>
    <Link className={s.cardLink} href="/playground">Open playground <span aria-hidden="true">→</span></Link>
   </article>
  </div>
 </section>
}
