import type { Manifest } from '@asi/core'
import { VIEWS } from '../../lib/views'
import { StatTile } from './StatTile'
import { WhySqlStrip } from './WhySqlStrip'
// Attributes are fetched newest first after startup; until then those entities are counted as pending.
export function FillProgress({manifest}:{manifest?:Manifest}) { if(!manifest?.pending) return null; return <p className="hero-fill" role="status">Loading attributes: {manifest.pending.toLocaleString('en-US')} of {(manifest.live??manifest.pending).toLocaleString('en-US')} entities pending, newest first</p> }
export function Hero({version,onView,manifest}:{version:number;onView:(id:string)=>void;manifest?:Manifest}) { return <section className="hero" aria-labelledby="hero-h"><div className="hero-row"><div><h1 id="hero-h">Ask live Arkiv data anything, in SQL.</h1><p>The indexed live entities are loaded into DuckDB in this tab. Join, group, sort and window them in milliseconds, with no 200 row pages.</p></div><div className="hero-cta"><a className="btn btn-lg" href="#showcase">Browse showcase</a><a className="btn btn-primary btn-lg" href="#console">Write a query ↗</a></div></div><FillProgress manifest={manifest}/><div className="tiles">{VIEWS[0].widgets.filter(w=>w.kind==='stat').map(w=><StatTile key={w.id} widget={w} version={version}/>)}</div><WhySqlStrip onView={onView}/></section> }
