import type { ReactNode } from 'react'
import s from './about.module.css'

// Shared by /about and the home page story. Every claim names the repository file that backs it; keep the two in step when either changes.
export const HOW = [
 { b: 'Replay the chain.', t: 'The indexer reads public eth_getLogs up to 3 blocks behind head and writes every live entity from log data: owner, creator, blocks and expiry.' },
 { b: 'Fill attributes.', t: 'Keyed lookups of at most 50 keys, newest first, each pinned to one block, on the anonymous RPC budget.' },
 { b: 'Stay live.', t: 'Each sync batch applies creations, patches, extensions, transfers and deletions straight from logs, then publishes a JSON delta.' },
 { b: 'Publish snapshots.', t: 'Every 30 blocks a new versioned pair of Parquet files is written. Older versions are pruned, two are kept.' },
 { b: 'Load in the browser.', t: 'The Next.js proxy streams the files with Range support. DuckDB WASM merges snapshot, delta and the live tail.' },
 { b: 'Follow the chain from the tab.', t: 'The browser polls the public RPC for new logs about every 4 seconds. Payload and verify go to the RPC directly, never through the indexer.' },
]

export const ELSEWHERE = [
 { h: 'Postgres', p: 'Whoever runs the database can edit any row, and readers have no independent source to check it against. Expiry becomes a job you hope keeps running.' },
 { h: 'IPFS', p: 'Content is addressed by hash and cannot change in place. There is no owner, no attribute query and no expiry beyond whoever stops pinning.' },
 { h: 'A subgraph', p: 'It needs a contract that emits events and a hosted indexer that users have to trust. Nothing in it removes rows when the source data should be gone.' },
 { h: 'Your own API', p: 'Users trust your server twice: for the data, and for the claim of who wrote it.' },
]

export type Feature = { title: string; does: ReactNode; why: ReactNode; see: ReactNode; src: string[] }
export const FEATURES: Feature[] = [
 { title: 'Typed attributes, payload on demand',
  does: <>Widgets carry <code>user</code> as <code>addr</code>; links point at their widget and dashboard with <code>key</code> attributes. Decoding keeps exact integers as text and a numeric <code>num</code> column.</>,
  why: <>Typed values sort and aggregate correctly in SQL. Payloads are not needed for analytics, so they never enter Parquet.</>,
  see: <>A Payload button on each result row reads the payload from the RPC when you click it, shown up to 128 KiB.</>,
  src: ['apps/web/lib/dash/server/operations.ts', 'packages/core/src/decode.ts', 'apps/web/components/RowActions.tsx'] },
 { title: 'Compound queries scoped by $creator',
  does: <>Key lookups render <code>($creator = addr(…)) AND ($key = key(…) OR …)</code> with the SDK query builder, at most 50 keys per call.</>,
  why: <>50 key terms fit the query length limit, 100 did not. The creator term keeps forged look alike entities out.</>,
  see: <>The status bar shows the indexed expression. With a creator expression, rows from other creators never reach your tab.</>,
  src: ['packages/core/src/query.ts', 'apps/web/components/dash/StatusBar.tsx'] },
 { title: 'Pinned reads with atBlock',
  does: <>Backfill and fills pass <code>atBlock</code> with cursor pagination, and a fill page answered at a different block is rejected.</>,
  why: <>Every page of one lookup describes the same block, so a write landing mid scan cannot tear a result.</>,
  see: <>Consistent rows, and a status bar that tells you how far the index is behind the chain head.</>,
  src: ['apps/indexer/src/backfill.ts', 'apps/indexer/src/fill.ts'] },
 { title: 'Expiry per entity type',
  does: <>Widgets live for 1, 7, 30 or 90 days. Dashboards live 90 days, and link lifetime follows the dashboard.</>,
  why: <>Each widget has a lifetime chosen by its creator. Expired widgets stop running.</>,
  see: <>Time left on widgets, dashboards and links, and expired slots on dashboards.</>,
  src: ['apps/web/lib/dash/schema.ts', 'apps/web/lib/dash/server/operations.ts'] },
 { title: 'Leases renewed by activity',
  does: <>Extend adds the widget&apos;s chosen lifetime, capped at 90 days remaining. Organize saves renew dashboards and their links together.</>,
  why: <>A widget can stay live while its creator or a dashboard owner using it still needs it.</>,
  see: <>A widget&apos;s <code>expires_at</code> moves forward. Verify reports extended when the chain holds a newer update with a later expiry.</>,
  src: ['apps/web/lib/dash/server/operations.ts', 'apps/web/lib/verify.ts'] },
 { title: 'One batch for a widget and its placement',
  does: <><code>predictEntityKeys</code> yields the widget key, then <code>executeBatch</code> creates the widget and a link that already references it.</>,
  why: <>Saving a widget directly to a dashboard creates both entities in one transaction.</>,
  see: <>The featured playground query joins widgets to their dashboard placement counts.</>,
  src: ['apps/web/lib/dash/server/operations.ts', 'apps/web/lib/views.ts'] },
 { title: 'Application ownership, chain provenance',
  does: <>The dashboard wallet creates widgets, dashboards and links. Their <code>user</code> attribute records application ownership.</>,
  why: <>Reads filter by the dashboard wallet&apos;s creator address and project. Writes check the signed in user&apos;s ownership.</>,
  see: <>Public widget and dashboard pages, with editing controls for their owners.</>,
  src: ['apps/web/lib/dash/entities.ts', 'apps/web/lib/dash/server/operations.ts'] },
 { title: 'Keyless sync from native logs',
  does: <>The indexer and the browser decode Arkiv entity events from <code>eth_getLogs</code>; no <code>arkiv_query</code> runs per event. By default no request carries an API key.</>,
  why: <>About 2,800 keys change per hour on Tiramisu. A keyed query per change would spend 25 to 35 percent of the monthly quota per day.</>,
  see: <>The live block, pending attribute fetches and RPC budget state in the status bar.</>,
  src: ['apps/indexer/src/sync.ts', 'apps/web/lib/live-tail.ts', 'apps/indexer/test/keyless.test.ts'] },
]

export const FRICTION = [
 { h: 'Anonymous budget and its 429', m: '10000 units, gone in one query', p: <>A broad <code>$expiresAt &gt; u64(0)</code> query with limit 5 used the whole anonymous budget. Later calls returned HTTP 429 with a plain object, not a JSON RPC error envelope. The client handles both shapes and waits for Retry-After.</> },
 { h: 'Undocumented query length limit', m: '50 key terms pass, 100 fail', p: <>An OR of 50 keys (about 4,100 characters) worked; 100 keys (about 8,200) failed with <code>-32004 query is too long</code>, and the failure still cost units. Lookups are chunked at 50.</> },
 { h: 'Flat cost per call', m: 'Arkiv-Cost: 100', p: <>One key, 50 keys, a full 200 row page and a failing call all showed the same cost. Batching keys is the only lever, so every lookup carries up to 50.</> },
 { h: 'Monthly quota is a percentage', m: 'no capacity or remaining units', p: <>Headers expose quota used as a percent, so remaining calls cannot be computed. Together with the measured change rate, this is why the indexer runs without an API key by default.</> },
]

export const IDS = [
 { role: 'Dashboard wallet (creator)', addr: '0xb0B87EdDB0bc777Eb663c7a11703ba5ED4849A28' },
]

export function Src({ files }: { files: string[] }) {
 return <span className={s.src}>{files.join(', ')}</span>
}

export const RELIES = [
 { b: <><code>$creator</code> and <code>$owner</code> are system fields.</>, t: 'The chain sets them, so the creator scope cannot be forged with an attribute.' },
 { b: 'Native expiry.', t: <>Every entity has an <code>expiresAt</code> block. The index enforces it instead of inventing its own retention.</> },
 { b: 'Typed, queryable attributes at a pinned block.', t: <>Lookups combine <code>$creator</code>, <code>$key</code> and <code>atBlock</code> with cursor pagination.</> },
 { b: 'A public RPC anyone can read.', t: 'Your browser checks rows and follows logs without the indexer in the path.' },
]

export const OFF_ARKIV = [
 { b: 'Parquet snapshots and the DuckDB checkpoint.', t: 'Derived, disposable copies. They can be rebuilt from public logs, and a store is tied to one chain ID and genesis hash.' },
 { b: 'SQL execution.', t: <><code>arkiv_query</code> returns at most 200 results per page with boolean filters only, so joins, grouping and window functions run in DuckDB.</> },
 { b: 'Payloads stay on chain.', t: 'They are fetched on demand and never written to Parquet.' },
]
