import s from './about.module.css'
import { EXPLORER_URL } from '../../lib/explorer'
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
 { h: 'Create and transfer in one batch', m: 'worked, block 803,198', p: <>The docs show <code>ownershipChanges</code> only for existing keys. A create with a salt from <code>predictEntityKeys</code> plus a transfer of that key in the same <code>executeBatch</code> works: one transaction logs EntityCreated, then OwnershipTransferred. Prediction and send share one slot of a serial queue.</> },
 { h: 'Wallet transport retries', m: '4 sends instead of 1', p: <>A viem <code>custom</code> transport retries 3 times by default, including <code>eth_sendTransaction</code>, on codes such as -32603. With Privy signing silently that would resend a write. The wallet transport sets <code>retryCount: 0</code>; a probe confirmed 4 provider calls before and 1 after.</> },
 { h: 'Extend at the cap', m: 'ExpiryNotExtended', p: <>An extend sets an absolute expiry and reverts when it is not later. Anyone may extend a user widget, so two viewers can race. The app computes the target from a fresh head, refuses to send at the 90 day cap, and maps the revert to the same message.</> },
 { h: 'Anonymous budget, again', m: 'ANON_COST_LIMITED on 20 October', p: <>Browser reads went straight to the public RPC on each visitor&apos;s own budget and hit HTTP 429. They now go through the same origin <code>/api/rpc</code> proxy, which adds the server&apos;s API key, and the UI shows a budget notice instead of retrying.</> },
 { h: 'Keyless attribute backlog', m: '809 of 36,457 pending', p: <>Without a key, attributes fill at up to 50 keys per query on the anonymous budget, newest first, while about 2,800 keys change per hour. The hosted indexer converges; rows stay queryable from log data while attributes load.</> },
]

/** On chain evidence (README.md, On chain evidence). Every value was read back from Tiramisu on 20 October 2026. */
export const APP_WALLET = '0x1f61c3cac1612c020f64739b128c5f198939c8cd'
export type Evidence = { role: string; kind: 'address' | 'entity'; value: string; tx?: string }
export const IDS: Evidence[] = [
 { role: 'App wallet, creator of every widget, dashboard and link', kind: 'address', value: APP_WALLET },
 { role: 'Featured dashboard: network overview', kind: 'entity', value: '0x78d7f64354c4457ae7d8193375768b11bcf91e7f64992cb02e18df4979e24376', tx: '0x8e538593d2516a7662fa1876ea313c5ef186a1bac877f503e7788ccb0dea20e9' },
 { role: 'Featured dashboard: expiry watch', kind: 'entity', value: '0x06d3cd9bab9569d89a08768750346cfc06b715051310dbed844162f255d0852b', tx: '0xb75afae47d011b77fc9dd5201812105bde679fe3f5e78a18a62b0a5db69814af' },
 { role: 'Featured dashboard: creators', kind: 'entity', value: '0x3f0a1beb784edd28b1373ec5edbc1b97a3b266dc15913b31020935ac52dc7256', tx: '0x759fb064b7b4bfef640bc58166ae68bfb19a2a1f200700c9f6e94f57425542d0' },
 { role: 'Featured dashboard: attributes', kind: 'entity', value: '0x4b0f0f42f1307982afdef3323c0444b67d2a1916038815acfcd9476b967ddc82', tx: '0x320d764b92cb113293f3c80187870cea5f71741f661ea77c14e3244919fd8a7b' },
 { role: 'Featured dashboard: activity', kind: 'entity', value: '0x558952f966a369a864d304d76fc0ae5fb3300b840af801e56f3ff422482cc228', tx: '0xa9adb7278efbcd35382824aefc90de21a564642a93a53829ded7771073fe63df' },
 { role: 'A user owned widget, readonly and permissionlessly extendable, created and transferred in one transaction', kind: 'entity', value: '0x78ca2e9ea9f292bc81a6356a89d7e73eddb6f491916209d673b6ec724b22be23', tx: '0xa3668515f09911d190336e92457afba8759f79f3f18870e7d5a33f7cd7a21f03' },
 { role: 'Its owner, a Privy embedded wallet', kind: 'address', value: '0x2f4d9088ff069c17c2ae6c051e3c78911b827757' },
]

/** /about: what breaks without Arkiv (README.md, Why Arkiv). */
export const ALTERNATIVES = [
 { alt: 'Postgres run by an operator', breaks: 'The operator decides which rows exist. It can keep a row after its expiry, write rows under any author and drop rows, and readers cannot check. Here the chain sets $creator and the expiry block, and Verify rereads any row.' },
 { alt: 'IPFS', breaks: 'Blobs by content hash: no typed attributes to filter on, no expiry, no owner who can transfer or delete, no query. Widget lifetimes, extension by anyone and transfer to the author would all disappear.' },
 { alt: 'A subgraph', breaks: 'Needs a schema and mapping per app plus a trusted indexer operator. This indexer works for any entity and any attributes, and the trust anchor stays the chain.' },
 { alt: 'Our own API', breaks: 'Is exactly what this project replaces: a closed endpoint that decides which rows exist and who wrote them.' },
]

/** /about: what deliberately stays off Arkiv, and why. */
export const OFF_CHAIN = [
 { what: 'Parquet snapshots, delta and manifest', why: 'Derived data that anyone can rebuild by replaying public logs. A cache, not a record.' },
 { what: 'DuckDB', why: 'Computation, not data. SQL runs in your tab and never on a server.' },
 { what: 'Session cookies, login nonces, rate limits', why: 'Short lived state of one web server. On chain they would be public and outlive their purpose.' },
 { what: 'Payload copies', why: 'Payloads stay on chain and load on demand. The indexer never copies them into Parquet.' },
 { what: 'The API key', why: 'A secret, kept in the server runtime only. A test checks that no build or browser file names it.' },
 { what: 'Email, handles, Privy IDs', why: 'Personal data. Only the wallet address and the login provider name are written.' },
]

/** /about: the two pillars, each with who is harmed today and what changes. */
export const PILLARS = [
 { name: 'Open Source', who: 'Arkiv app teams, analysts and AI agents who need GROUP BY or JOIN over Arkiv data.', today: <>They page <code>arkiv_query</code> 200 rows at a time on an anonymous budget of 10,000 units an hour, which one broad query used up, or they trust a closed hosted indexer that decides which rows exist.</>, change: <>From day one: a documented data contract (manifest, delta, two Parquet files with fixed columns), an MIT indexer that runs without an API key, and hosted files that DuckDB or Python read without asking anyone. This app reads only that contract.</>, src: ['README.md', 'arkiv/schema.md', 'packages/core/src/views.ts', 'apps/indexer/test/keyless.test.ts'] },
 { name: 'Security', who: 'A viewer of a Featured dashboard, and a widget author.', today: <>Anyone can create a dashboard with <code>project = arkiv-sql-indexer-dash</code>, <code>user</code> set to the app wallet, <code>login = arkiv</code> and the slug of a Featured dashboard. An app that trusted attributes would show it as Featured and run its SQL in your tab. A transferred, editable widget could have its author rewritten.</>, change: <>Every read filters on the chain set <code>$creator</code>, and Featured also needs <code>$owner</code> to be the app wallet. Decoders recheck the creator, the owning address is shown next to every Featured chip, and user widgets are readonly so no new owner can rewrite the author.</>, src: ['apps/web/lib/dash/entities.ts', 'apps/web/lib/dash/official.ts', 'apps/web/lib/dash/sql.ts', 'apps/web/lib/dash/schema.ts'] },
]

/** Explorer page of an address, entity key or transaction hash. */
export function explorerUrl(kind: 'address' | 'entity' | 'tx', value: string): string {
 return `${EXPLORER_URL}/${kind}/${value}`
}

export function Src({ files }: { files: string[] }) {
 return <span className={s.src}>{files.join(', ')}</span>
}
