import s from './about.module.css'
import type { FlowStep } from './Flow'

// Copy shared by the home page and /about. Every claim is backed by the files named in the Src notes on /about
// (README.md, SPECS.md, arkiv/schema.md and the code); keep them in step when either changes.

/** The public repository (from the git remote of this checkout). */
export const REPO_URL = 'https://github.com/SlayerAnsh/hackathon-duckdb-indexer'
/** The hosted indexer this app reads (README.md, Quick start). */
export const HOSTED_INDEXER_URL = 'https://arkiv-sql-indexer.dokploy.anshudhar.dev'

/** Landing: the four steps from the chain to a dashboard. */
export const PIPELINE: FlowStep[] = [
 { title: 'Arkiv chain', text: 'Entities, their attributes and expiry blocks, on the Tiramisu testnet.' },
 { title: 'Indexer', text: 'Follows the chain and publishes the data as Parquet files plus a live delta.' },
 { title: 'Your browser', text: 'DuckDB loads the files and runs every query right in this tab.', tone: 'accent' },
 { title: 'Your dashboards', text: 'Saved queries turn into charts, widgets and public reports.' },
]

/** Landing: why the numbers can be trusted. */
export const TRUST = [
 { title: 'Live', text: 'Your tab follows new blocks every few seconds, so new rows appear without a reload.' },
 { title: 'Verifiable', text: 'Verify reads any row again from the chain and flags it when the copy is out of date.' },
 { title: 'Expiring', text: 'A row leaves every query once its expiry block passes, as Arkiv intends.' },
]

/** Landing and /about: what happens to a saved widget. */
export const WIDGET_LIFE: FlowStep[] = [
 { title: 'Save', text: 'The app wallet creates the widget. Saving is free.' },
 { title: 'Transferred to you', text: 'In the same transaction it moves to your wallet.' },
 { title: 'Extend, transfer or delete', text: 'Signed in your browser and paid in GLM. Anyone logged in may extend it.' },
 { title: 'Expires', text: 'After its lifetime ends, unless someone extends it.', tone: 'faded' },
]

/** /about: the architecture, one level deeper than the landing flow. */
export const ARCH: FlowStep[] = [
 { title: 'Arkiv RPC', text: 'Public logs and keyed lookups.' },
 { title: 'Bun indexer', text: 'Writes Parquet and a delta.' },
 { title: 'Next.js proxy', text: <>Serves them at <code>/data</code>.</> },
 { title: 'DuckDB WASM', text: 'Runs your SQL in the tab.', tone: 'accent' },
]

export const FRICTION = [
 { h: 'Anonymous budget and its 429', m: '10000 units, gone in one query', p: <>A broad <code>$expiresAt &gt; u64(0)</code> query with limit 5 used the whole anonymous budget. Later calls returned HTTP 429 with a plain object, not a JSON RPC error envelope. The client handles both shapes and waits for Retry-After.</> },
 { h: 'Undocumented query length limit', m: '50 key terms pass, 100 fail', p: <>An OR of 50 keys (about 4,100 characters) worked; 100 keys (about 8,200) failed with <code>-32004 query is too long</code>, and the failure still cost units. Lookups are chunked at 50.</> },
 { h: 'Flat cost per call', m: 'Arkiv-Cost: 100', p: <>One key, 50 keys, a full 200 row page and a failing call all showed the same cost. Batching keys is the only lever, so every lookup carries up to 50.</> },
 { h: 'Monthly quota is a percentage', m: 'no capacity or remaining units', p: <>Headers expose quota used as a percent, so remaining calls cannot be computed. Together with the measured change rate, this is why the indexer runs without an API key by default.</> },
]

export const IDS = [
 { role: 'App wallet (creator of every app entity)', addr: '0xb0B87EdDB0bc777Eb663c7a11703ba5ED4849A28' },
]

export function Src({ files }: { files: string[] }) {
 return <span className={s.src}>{files.join(', ')}</span>
}
