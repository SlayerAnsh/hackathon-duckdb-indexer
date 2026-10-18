# Arkiv SQL Indexer: Specification

Status: implemented, 18 October 2026 (submission deadline 18 October 2026, 22:59 UTC). Sections describe the current code. Where the original plan changed, the text says so.

## 1. Summary

A self hosted indexer that mirrors the Arkiv entities matching one optional Arkiv query expression (blank means every entity) into immutable Parquet snapshots plus a small live delta. A Next.js frontend loads them into DuckDB WASM so anyone can run full SQL (joins, GROUP BY, ORDER BY on attributes, window functions) in their own browser. Expired data disappears from every layer: the snapshot excludes it, old snapshots are deleted, and the browser filters every row against the current chain head read directly from Arkiv RPC. A verify button checks any row against the chain.

## 2. Problem

`arkiv_query` supports boolean filters only: newest first, at most 200 results per page, no joins, no GROUP BY, no ORDER BY on attributes, no aggregation beyond count. Teams who want analytics must build their own indexer or trust someone else's, and typical indexers keep data forever, which breaks the expiry promise Arkiv makes.

## 3. Goals and non goals

Goals (P0 unless marked):

1. Index all entities matching a configured Arkiv expression, with backfill and live sync.
2. Publish versioned Parquet snapshots and a per block delta over HTTP.
3. Browser SQL over the merged data (snapshot, delta, live tail) through DuckDB WASM.
4. Showcase of fixed analytics cards, each showing its SQL.
5. SQL editor with syntax highlighting and schema aware autocomplete.
6. Expiry enforced in the browser against the live chain head.
7. Demo writer app that writes through the SDK (per type expiry, `extendEntity`, batch writes, ownership transfer).
8. Verify button per row (P1).
9. Browser live tail (P1). Implemented as direct `eth_getLogs` polling decoded with SDK `ENTITY_EVENTS_ABI`, not `watchEntityEvents`.
10. Saved queries stored as Arkiv entities (P2). Not implemented.

Non goals: server side SQL endpoint, history beyond current state, Parquet expiry buckets, DataFusion, DuckLake, multi expression indexes.

## 4. Verified facts (SDK `@arkiv-network/sdk` 0.8.1 source, read 18 October 2026)

- `arkiv_query(query, { atBlock?, select?, limit?, cursor? })`. `atBlock` reads past state "within the node's retained range". `limit` max 200. The cursor is bound to the query, block and selection, so a backfill pinned to one `atBlock` is a consistent snapshot.
- `select` fields: `key, owner, creator, createdAt, updatedAt, expiresAt, creationFlags, contentType, payload, attributeSchema, attributes`. All default off except `key`. `updatedAt` is selectable even though `$updatedAt` cannot be used as a predicate.
- `$key` works as a predicate: the SDK `getEntity` is `arkiv_query("$key = <key>", select "*", limit 1)`. There is no `arkiv_getEntity` call in the SDK.
- Attribute values arrive typed by tag: `i32` as a JSON number, `u64` and `u256` as `0x` quantities, `dec` as a decimal string, byte types as `0x` data, `str` as a string.
- `watchEntityEvents({ fromBlock?, pollingInterval?, onEvent, onError })` polls logs from `ARKIV_ADDRESS` (`0x4400000000000000000000000000000000000044`). Default polling is half a block. Events: `EntityCreated`, `EntityPatched`, `ExpiryExtended`, `OwnershipTransferred`, `EntityDeleted`, each with `blockNumber`, `transactionHash`, `logIndex`, `entityKey`.
- Block time is 2 seconds (`BLOCK_TIME` constant).
- Bun 1.3.11 runs `@duckdb/node-api` 1.5.6 and writes and reads Parquet (smoke tested). `COPY ... TO 'dir' (FORMAT parquet)` without `PARTITION_BY` writes a single file named `dir`, so always give a full file path.

- Live spike on Tiramisu, 18 October 2026 (chain ID 7738577, genesis `0x95488063112df36be71b4700200a1b18e2578317853f9d82af5c3da313a5ab71`, head about 742,800, about 30,478 live entities):
  - Query syntax uses `AND`, `OR`, `NOT` and typed literals, for example `$creator = addr(0x..) AND ($key = key(0x..) OR $key = key(0x..))`. Strings are `str('..')`. Build key filters with the SDK expression helpers, never by hand.
  - `arkiv_query` is cost metered. Unauthenticated callers share a budget per caller of `limit=10000` cost units, reset after about one hour (headers `RateLimit`, `Retry-After`, `Arkiv-Cost`, `Arkiv-Quota-Used-Percent`). One broad query (`$expiresAt > u64(0)`, limit 5) used the whole budget. After that every `arkiv_query` returns HTTP 429 with body `{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}`, which is not a JSON-RPC error envelope.
  - `eth_blockNumber`, `eth_getLogs`, `arkiv_getEntityCount` and `arkiv_getBlockTiming` kept working while the query budget was exhausted. `eth_getLogs` over 5,000 blocks returned 12,797 logs in one call.
  - Consequences: queries must stay selective, and neither the indexer nor the browser may run `arkiv_query` per event. The first plan required an API key for the indexer; the later measurements in 7.1 made the indexer keyless by default. The browser uses `eth_blockNumber` for the live head and `eth_getLogs` for the change feed. Verify and payload fetches spend the visitor's own anonymous budget, one batched `$key` query per click.

- With an API key (header `Authorization: Bearer <key>`, also accepted as `X-API-Key`; env `TIRAMISU_API_KEY`):
  - Every `arkiv_query` costs a flat 100 units (`Arkiv-Cost: 100`), whether it is one key, 50 OR'ed keys, a full 200 row page with all fields, or a request that fails. Cost is per call, so batching is free.
  - A short term limit (`RateLimit: limit=9999 ... reset=1`) plus a monthly quota (`Arkiv-Quota-Used-Percent`, which read 1 after about 20 calls). The quota size is unknown, so the indexer must minimise calls and log the quota header.
  - An OR of 50 `$key = key(..)` terms (about 4,100 characters) works. 100 terms (about 8,200 characters) fails with `-32004 query is too long`. Chunk size: 50 keys.
  - `atBlock` 200,000 blocks back (about 4.6 days) works.
  - Responses carry `updatedAt`, `expiresAt`, `createdAt` as hex quantities, `creationFlags` as `{readonly, permissionlessExtension, raw}`, attributes as `{name, type, value}` with `u64` as a hex quantity.
  - Chain wide churn is high (about 115 distinct keys touched per 60 blocks, mostly load test traffic), so the indexer must not query every touched key.
- Sync consequence (relevance prefilter): the indexer keeps the set of indexed keys. A touched key is queried only when it is already indexed, or when its `EntityCreated` log owner (topic 2) passes the expression's `$creator`/`$owner` terms. With no such terms, every touched key is queried. Queries run at most once per `SYNC_BATCH_BLOCKS` (default 5) blocks, in chunks of 50 keys, with `atBlock` set to the last block of the batch.

## 5. Spike results

1. `atBlock` 200,000 blocks back (about 4.6 days) worked (section 4).
2. Chunk size: 50 `$key` terms per query (section 4).
3. `watchEntityEvents` is not used. Both the indexer and the browser poll `eth_getLogs` directly, which gives explicit windows and checkpoints.
4. The browser uses a one row `live_head` table instead of `getvariable()`.
5. `expiresAt` is a block number, and an entity is live while `expiresAt > block`.

Surprises are recorded in `arkiv/friction.md` with versions and reproduction steps.

## 6. Architecture

```
Arkiv RPC (Tiramisu, public endpoint)
   |  eth_getLogs (replay, live sync)              ^  eth_blockNumber, eth_getLogs (live tail),
   |  arkiv_query $key batches (fill)              |  arkiv_query $key batches (live attributes, payload, verify)
   v                                               |
indexer (Bun, single process)                 browser (via Next.js /data proxy)
   DuckDB file, only writer                      DuckDB WASM in a worker
   snapshot builder  -> snap/v{n}/*.parquet ---> base tables
   delta writer      -> delta.json          ---> delta tables
   Bun.serve: manifest.json, snap, delta         live tables (from the live tail)
                                                 merged tables, public views filtered by live head
demo writer (Bun, synthetic testnet wallet) -> Arkiv via SDK wallet client
```

Monorepo with Bun workspaces:

```
packages/core       shared types, attribute decoding, expression helpers, row shapes
apps/indexer        sync, snapshot, delta, HTTP
apps/web            Next.js dashboard and SQL editor
apps/demo-writer    synthetic data generator using the SDK
arkiv/schema.md     entity schema and exact queries
arkiv/friction.md   friction report
```

## 7. Indexer

### 7.1 Configuration (environment)

| Variable | Meaning | Default |
|---|---|---|
| `ARKIV_RPC_URL` | HTTP RPC | Tiramisu public RPC |
| `INDEX_EXPRESSION` | Optional Arkiv query expression, blank means every entity | empty |
| `PUBLIC_RPC_URL` | Anonymous logs and chain metadata | Tiramisu public RPC |
| `BACKFILL_MODE` | Public log replay or legacy query scan | `logs` |
| `FILL_RPC_URL` | RPC for attribute fills of pending rows | Tiramisu public RPC |
| `FILL_USE_API_KEY` | send the API key with fills (spends monthly quota) | `false` |
| `SYNC_USE_API_KEY` | keyed live sync: key lookups on `ARKIV_RPC_URL` (spends monthly quota) | `false` |
| `FILL_CHUNK` | keys per fill query, at most 50 | 50 |
| `FILL_INTERVAL_MS` | pause between fill queries | 4000 |
| `TIRAMISU_API_KEY` | sent as `Authorization: Bearer`, server only; optional | empty (unused) |
| `SYNC_PAUSED` | serve existing store without RPC calls | `false` |
| `CONFIRMATIONS` | blocks behind head | 3 |
| `SYNC_BATCH_BLOCKS` | blocks per live sync batch | 5 |
| `SNAPSHOT_INTERVAL_BLOCKS` | blocks between snapshots | 30 (one minute) |
| `KEEP_SNAPSHOTS` | snapshot versions kept | 2 |
| `DATA_DIR` | output root | `./data` |
| `PORT` | HTTP port | 8080 |

Warn at startup when `INDEX_EXPRESSION` contains no `$creator` term, because user attributes can be written by anyone.

The API key is never sent by default. Only `BACKFILL_MODE=query`, `SYNC_USE_API_KEY=true` and `FILL_USE_API_KEY=true` send it; each requires `TIRAMISU_API_KEY` and startup fails with a clear message without it (unless `SYNC_PAUSED`). Startup logs `API key not used` or a warning naming the flags that enable it. No RPC client is constructed with the key unless one of these flags is set. Measured live rate on Tiramisu: about 2,800 distinct keys touched per hour (4,011 events per 1,800 blocks); keyed live sync at that rate would use roughly 25 to 35 percent of the monthly quota per day, while the anonymous budget allows about 100 queries of up to 50 keys per hour.

### 7.2 Store identity

On startup read `eth_chainId` and the hash of block 0. The store lives at `DATA_DIR/<chainId>-<genesisHash first 10 hex>/`. A chain reset with the same chain ID gets a new store. If the stored expression differs from the configured one, refuse to start and print the fix (delete the store or restore the expression).

### 7.3 DuckDB schema (indexer side)

```sql
CREATE TABLE entities (
  key VARCHAR PRIMARY KEY,           -- 0x hex, lowercase
  owner VARCHAR, creator VARCHAR,
  created_at UBIGINT, updated_at UBIGINT, expires_at UBIGINT,
  content_type VARCHAR, creation_flags INTEGER,
  attrs_pending BOOLEAN DEFAULT false -- written from log data, attributes not fetched yet
);                                   -- payload stays on chain, never in SQL
CREATE TABLE attributes (
  key VARCHAR, name VARCHAR, type VARCHAR,
  value VARCHAR,                     -- canonical text: decimal for numbers, 0x for bytes and addresses
  num DOUBLE,                        -- numeric types only, approximate for u256 and dec
  PRIMARY KEY (key, name)
);
CREATE TABLE changes (               -- drives the delta
  block UBIGINT, key VARCHAR, deleted BOOLEAN
);
CREATE TABLE sync_state (
  chain_id UBIGINT, genesis_hash VARCHAR, expression VARCHAR,
  start_block UBIGINT, head_block UBIGINT,
  snapshot_version INTEGER, snapshot_block UBIGINT, head_hash VARCHAR
);
CREATE TABLE store_identity (chain_id UBIGINT, genesis_hash VARCHAR, expression VARCHAR);
```

The planned `payload_size` column was dropped, since it would need every payload at ingest. Backfill also keeps `replay_*` tables while it runs, and the filler keeps `fill_misses`.

### 7.4 Backfill

1. `B0 = head - CONFIRMATIONS`.
2. Replay native operation logs from block zero through `B0` using `PUBLIC_RPC_URL` without an API key, in adaptive windows that start at 20,000 blocks. Commit each window and its next block checkpoint atomically, deduplicating by block and log index.
3. Compute live keys in SQL: a creation exists, the latest operation is not deletion, and the latest known expiration exceeds `B0`.
4. The replay also records, per key, the owner and creation flags from `EntityCreated`, the new owner from `OwnershipTransferred`, and the expiry from `EntityCreated` and `ExpiryExtended`. Replay tables persisted before this capture get a second resumable pass over the public logs that only fills owner and flags.
5. Insert every live key without a fetched row from log data: owner is the latest owner, creator the owner at creation, `created_at` the creation block, `updated_at` the block of the latest event, `expires_at` the latest expiry, `content_type` NULL and `attrs_pending = true`. Fetched rows are never overwritten.
6. Set `start_block = head_block = B0` and build snapshot v1 (7.6) immediately. No row query is needed before the first snapshot.
7. After startup a filler runs beside live sync. Every `FILL_INTERVAL_MS` it takes the `FILL_CHUNK` pending keys with the highest `updated_at` (then `created_at`), queries them by key at the indexed head on `FILL_RPC_URL` without the API key, and upserts the returned rows with `attrs_pending = false` and a change row so the next delta carries them. A key that is not returned is dropped when its row expired at the queried block or when a filter expression is set; otherwise it stays pending and moves behind keys not yet tried. HTTP 429 pauses only the filler until Retry-After and is logged once. Keys that live sync fetches, deletes or sweeps in the meantime are no longer pending and are never overwritten by an older fill.

The anonymous budget is about 10,000 units per IP and window (about one hour), at least 100 units per query, so about 100 fills of 50 keys per window. `FILL_USE_API_KEY=true` sends the key with fills and spends the monthly quota instead.

`BACKFILL_MODE=query` retains the legacy paginated expression scan as an explicit option. Public log capacity errors use the suggested retry range when present, otherwise halve the window. HTTP 429 waits for Retry-After. Failed windows preserve the last committed checkpoint.

### 7.5 Live sync

Runs every `SYNC_BATCH_BLOCKS` blocks (default 5, about 10 seconds). By default (logs mode without `SYNC_USE_API_KEY`) sync is keyless:

1. `to = chainHead - CONFIRMATIONS`, `from = head_block + 1`. Skip when fewer than `SYNC_BATCH_BLOCKS` blocks are ready.
2. Fetch and decode logs as in step 2 below, then apply them in block and log order from log data alone, with no `arkiv_query`:
   * `EntityCreated` (passing the creator or owner prefilter of step 3): insert a log row with owner, creator, `created_at = updated_at = block`, `expires_at`, flags, `content_type NULL`, `attrs_pending = true`.
   * `EntityPatched`: keep the row and its attributes, set `attrs_pending = true` and `updated_at`.
   * `ExpiryExtended`: set `expires_at` and `updated_at`.
   * `OwnershipTransferred`: set `owner` and `updated_at`; with a non empty expression also set `attrs_pending = true` so the filler rechecks the filter.
   * `EntityDeleted`: remove the row and its attributes with a tombstone.
   * Events for keys without a row are ignored.
3. Every changed key gets `changes(to, key, false)`, so the delta carries it. Expiry sweep, hash checks and the checkpoint commit work as below, in one transaction.
4. The filler (7.4 step 7) fetches attributes for pending keys newest first, so new and patched keys come first. It writes a fetched row only if the row is still pending and its `updated_at` is not newer than the block it queried; otherwise the key stays pending and is fetched again at a newer block. A re-fetch replaces all attributes.

Limitation: with a filter expression that has no `$creator` or `$owner` term, keyless sync cannot see an existing entity that starts matching through a patch, nor one transferred into a `$owner` filter. Use `SYNC_USE_API_KEY=true` for such filters.

Keyed sync (`SYNC_USE_API_KEY=true` or `BACKFILL_MODE=query`):

1. `to = chainHead - CONFIRMATIONS`, `from = head_block + 1`. Skip when `to < from`.
2. `eth_getLogs` on `ARKIV_ADDRESS` for `[from, to]`, split into windows of at most 1,000 blocks; a `max results` error halves the window. Decode with the SDK `ENTITY_EVENTS_ABI`. The entity key is topic 1. For `EntityCreated` the owner is topic 2.
3. Relevance prefilter (SPECS §4): keep a touched key when it is already indexed, or when it was created in this batch by an owner the expression's `$creator`/`$owner` terms allow. When the expression has no such terms, keep every touched key.
4. Query `(<expr>) AND ($key = key(k1) OR ... OR $key = key(k50))` with `atBlock: to`, 50 keys per call.
5. Keys returned: upsert entity, replace attributes, insert `changes(to, key, false)`.
6. Keys kept but not returned: the entity was deleted, expired, or stopped matching the filter. Delete it and insert `changes(to, key, true)`. This one rule handles deletes, patches that leave the filter, and transfers that leave a `$owner` filter. No local expression evaluator needed.
7. Commit the batch in one transaction, setting `head_block = to`. A batch with no relevant keys makes zero `arkiv_query` calls.

Every batch also runs the expiry sweep at `to`: `DELETE FROM entities WHERE expires_at <= to` (and matching attributes), recorded as tombstones in `changes`. Expiry emits no event, so the sweep is the only way the indexer forgets.

Provider limits (from the Arkiv indexing guide, observed on Tiramisu): `eth_getLogs` fails above 20,000 results (`-32602 query exceeds max results 20000`), so retry the suggested range or halve the window; JSON-RPC batches above 50 calls fail with HTTP 413; `-32006` means the requested block state is unavailable, so keep the checkpoint and never substitute head. The indexer stores the hash of `head_block` and rechecks it each batch; a mismatch (reorg or reset) triggers a fresh backfill into a new store generation. Confirmation lag is a policy, not finality.

If `atBlock` falls outside the retained range (indexer down too long, `-32006`), fall back to a fresh backfill into a new store generation `-g<n>`, selected through `active-generation.json`.

### 7.6 Snapshot

Every `SNAPSHOT_INTERVAL_BLOCKS`:

```sql
COPY (SELECT * FROM entities WHERE expires_at > $head) TO 'snap/v{n}/entities.parquet' (FORMAT parquet);
COPY (SELECT a.* FROM attributes a JOIN entities e USING (key) WHERE e.expires_at > $head)
  TO 'snap/v{n}/attributes.parquet' (FORMAT parquet);
```

Then write `manifest.json` to a temp file and rename it (atomic). Delete versions older than `KEEP_SNAPSHOTS`. Truncate `changes` rows at or below the snapshot block.

### 7.7 Delta

After every processed block, write `delta.json` (temp file and rename):

```json
{ "fromBlock": 1201, "toBlock": 1217,
  "entities": [ { "key": "0x..", "...": "latest row" } ],
  "attributes": [ { "key": "0x..", "name": "..", "type": "..", "value": "..", "num": 1 } ],
  "tombstones": [ { "key": "0x..", "block": 1210 } ] }
```

Contents: latest state for every key in `changes` above the snapshot block. Big integers are strings.

### 7.8 Manifest

```json
{ "chainId": 60138453045, "genesisHash": "0x..", "expression": "$creator = 0x..",
  "version": 12, "snapshotBlock": 1200, "headBlock": 1217,
  "files": { "entities": "snap/v12/entities.parquet", "attributes": "snap/v12/attributes.parquet" },
  "delta": "delta.json", "live": 30700, "pending": 18200 }
```

`live` counts entities alive at the head and `pending` those still waiting for attributes. The indexer rewrites these two counts after each fill; the browser shows a progress line while `pending` is above zero.

### 7.9 HTTP (Bun.serve)

| Path | Cache | Notes |
|---|---|---|
| `/manifest.json` | `no-cache` | ETag |
| `/delta.json` | `no-cache` | ETag, client polls every 2 s |
| `/snap/v{n}/*` | `public, max-age=300, immutable` | Range requests, versioned so never rewritten |
| `/health` | none | head lag, last snapshot, live and pending counts |

The indexer is not exposed publicly. The browser reaches it only through the Next.js proxy (9.0), so no CORS headers are needed. Parquet URLs never change content, so range requests from DuckDB WASM can never mix two versions.

## 8. Browser data layer

1. Load DuckDB WASM from jsDelivr bundles (`mvp` or `eh`) in a worker. No threaded bundle, so no COOP or COEP headers are needed.
2. Fetch the manifest. Check `chainId` and genesis hash against the RPC, and show a banner on mismatch.
3. Import the snapshot into tables `base_entities` and `base_attributes` (data is small, so full import, no lazy views).
4. Poll `delta.json` every 2 s with `If-None-Match` and refetch the manifest about every 10 s. On change, replace `delta_entities`, `delta_attributes`, `delta_tombstones`. A delta whose `fromBlock` does not follow the manifest's snapshot block triggers a manifest refetch first.
5. Freshness comes from the browser live tail on the public RPC without an API key, starting at `delta.toBlock + 1`. Poll logs every four seconds in windows of 1,000 blocks. Apply deletes, expiry extensions and transfers from logs. Creations and patches enter `live_pending`; fetch attributes with expression scoped batches of at most 50 keys (`atBlock` head, `limit` 50), at most once every 20 seconds. Use the indexed key and creation owner relevance prefilter from 7.5. HTTP 429 pauses attribute fetching until Retry-After while log updates continue. Failed requests never delete rows. Live rows compete with delta and base by updated block, with live winning ties. Pending rows keep previous attributes. Clear live tables on snapshot version change.

The backend may serve an existing store with `SYNC_PAUSED=true`, making no RPC calls and requiring no API key. Missing stores fail startup clearly. If the indexer is unreachable, the proxy serves the same files from a read only mount of the data directory (9.0). The optional API key is used only by the keyed backend modes (7.1), is unused by default, and never reaches the browser.
6. Poll `eth_blockNumber` every 2 s and store it as `live_head`.

The merge runs once per data change into plain tables `merged_entities` and `merged_attributes`. Internal views retain the complete source ranking and pending attribute fallback. A fetched row wins over a pending row; otherwise the newest updated block wins, with live winning ties. Attribute sets come from the winning source, with previous base or delta attributes retained for live pending keys.

Snapshot loads, delta replacements, live tail applies and live table clears refresh both merged tables in the same transaction and serial section as their raw writes. Console and dashboard queries use that serial queue too, so they cannot observe a partially refreshed merge. Head updates alone do not refresh the merged tables.

Public views (the only names shown in autocomplete docs) apply expiry at query time:

```sql
CREATE VIEW entities AS
SELECT * FROM merged_entities
WHERE expires_at > (SELECT block FROM live_head);

CREATE VIEW attributes AS
SELECT a.* FROM merged_attributes a JOIN entities e ON e.key = a.key;
```

The public columns, including `entities.attrs_pending`, stay unchanged. Even a head change with no data change immediately hides expired entities and their attributes. A patch that removes an attribute removes it from the materialized attribute set too.

A demo wide view (for example `tickets`) is a `PIVOT` over `attributes` for one `type`, defined in the browser, so no extra Parquet file is needed.

## 9. Frontend (Next.js)

- Next.js App Router with `output: 'standalone'` (a Node server, needed for the proxy). Pages are client components; DuckDB WASM runs only in the browser.
- Pages: `/` (story sections and live stats), `/showcase` (chart cards grouped into Overview, Expiry, Creators, Attributes and Activity views), `/playground` (SQL editor) and `/about` (architecture and expiry figures).
- Status bar: indexed expression, chain, stored and serving blocks, oldest block with complete attributes, head lag, and live tail pending count and budget state.

### 9.0 Data proxy

The browser loads all index data from the Next.js origin under `/data/*`. A route handler `app/data/[...path]/route.ts` forwards each request to `INDEXER_URL` (runtime environment variable, default `http://indexer:8080`):

- Forwards request headers `Range`, `If-None-Match`, `If-Modified-Since`.
- Returns the upstream status unchanged (200, 206, 304, 404) and copies `Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`, `ETag`, `Cache-Control`.
- Streams the body (`new Response(upstream.body, ...)`), never buffers it.
- `export const dynamic = 'force-dynamic'` and `fetch(..., { cache: 'no-store' })` so Next.js never caches a mutable file such as `manifest.json` or `delta.json`.
- Allows only `manifest.json`, `delta.json`, `health` and `snap/v{n}/{entities,attributes}.parquet` paths, and rejects anything else with 404 (no open proxy).
- With `DATA_DIR` set (Compose mounts the index read only at `/data`), a network failure or upstream 502, 503 or 504 serves the same allowed files from disk with header `x-served-by: disk`. The status bar shows the source.

A route handler is used instead of `rewrites()` in `next.config` because rewrites are fixed at build time (the indexer URL could not change per deployment) and their forwarding of `Range` and conditional headers would need separate verification. Test: a `curl -H 'Range: bytes=0-99'` through the proxy returns 206 with the same bytes as the indexer.

### 9.1 Showcase

Chart cards defined in `apps/web/lib/views.ts`, each showing its SQL, its timing and, where relevant, the clause `arkiv_query` cannot express. Views:

1. Overview: live entities, distinct creators and owners, known entities (attributes fetched), entities expiring within an hour, creations per time bucket, entities by `type`, recently updated entities.
2. Expiry: median remaining lifetime, expiry horizon histogram, expiry bucket by type, entities expiring next.
3. Creators: top 10 creators, the SQL equivalent of a `$creator` filter, creator versus current owner, creators by distinct types.
4. Attributes: attribute names and value types, numeric statistics, top `status` and `priority` values.
5. Activity: updates per time bucket, created versus updated, running count of creations (window function).

Block numbers convert to time at 2 seconds per block. Charts use Recharts or plain SVG.

### 9.2 SQL editor

- CodeMirror 6 through `@uiw/react-codemirror` with `@codemirror/lang-sql`. Syntax highlighting from the SQL language package.
- Autocomplete: table and column names read from `information_schema.columns` for the public views, passed as the `schema` option, plus SQL keywords and DuckDB function names from `duckdb_functions()`.
- Ctrl or Cmd plus Enter runs. Cancel button interrupts the running query. Results capped at 1,000 displayed rows with a note, and CSV download of the full result.
- Snippet sidebar with every showcase query plus the featured JOIN and GROUP BY query "Open tickets with most discussion", and a local query history.
- Query text kept in the URL hash so a query can be shared as a link.

### 9.3 Row actions

- Payload: fetched on demand from Arkiv RPC (`$key = k`, select payload), never through the indexer.
- Verify (P1): when the result has a `key` column, batch query `$key = k` at head (chunks of 50, selection `key`, `updatedAt`, `expiresAt`, `owner`) and label each row `ok`, `stale`, `extended`, `expired` or `deleted`, or `present` when the result lacks `updated_at` and `expires_at`. The tooltip names the RPC URL and block checked and states that this is a consistency check, not a cryptographic proof, because `eth_getProof` is unavailable.

## 10. Demo writer

Bun script using the `@arkiv-network/sdk` wallet client with a synthetic testnet wallet (address listed in README, key supplied only through `DEMO_PRIVATE_KEY`). Domain: a support desk. Full attribute and expiry details are in `arkiv/schema.md`.

| Type | Expiry | Writes |
|---|---|---|
| `ticket` | 7 days | created with its first `comment` in one `executeBatch` (keys from `predictEntityKeys`) and `permissionlessExtension`; status patched; `assignee` patched, then ownership transferred to an agent wallet |
| `comment` | 1 day | each new comment extends its ticket (`extendEntity` as a lease renewed by activity) |
| `heartbeat` | 10 minutes | shows expiry visibly removing rows within the demo video |

Runs one action every `DEMO_INTERVAL_MS` (default 8000) with a seeded generator (`DEMO_SEED`, default 1). The indexer does not depend on the domain.

## 11. Saved queries on Arkiv (P2)

Not implemented. Plan: entity type `saved_query`, scratch 1 day, pinned 30 days, extended on view, author shown via `$creator`. It needs a browser wallet, so it stayed last in priority.

## 12. Security and abuse

- No server side SQL. Arbitrary queries run in the visitor's browser and only cost the visitor.
- The only access control is the indexed expression. Only entities matching it are published, so `$creator` filtering is the Security track story. Startup warns when the expression has no `$creator` term.
- `TIRAMISU_API_KEY` reaches only the indexer service, is unused by default, and never reaches the web build, the browser or the writer. The deployment test asserts this for the compose file and Dockerfiles.
- The indexer serves static files and JSON only. No write endpoints.

## 13. Expiry guarantee (what we claim)

The index never serves an expired row:

1. Snapshots exclude rows with `expires_at <= head` at build time.
2. Old snapshots are deleted after `KEEP_SNAPSHOTS` versions, and the indexer DB sweeps expired rows.
3. The browser hides any row with `expires_at <= live_head`, where `live_head` comes from Arkiv RPC, not from the indexer.

We do not claim that a consumer cannot copy data while it is live. No index can promise that.

## 14. Deployment

One `docker-compose.yml` at the repository root plus `docker-compose.local.yml`, which publishes `3000:3000` for local runs (`docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`):

| Service | Image | Port | Notes |
|---|---|---|---|
| `indexer` | `oven/bun:1.3`, runs `apps/indexer` | 8080, internal only (`expose`, no `ports`) | bind mount `${INDEX_DATA_PATH:-./data}` at `/data`; healthcheck on `/health` |
| `web` | built with `oven/bun:1.3`, runs on `node:22-slim` as a Next.js standalone server | 3000, `expose` only in the base file | `INDEXER_URL=http://indexer:8080`; same data path mounted read only for the disk fallback; `depends_on: indexer (service_started)` |
| `demo-writer` | `oven/bun`, `apps/demo-writer` | none | compose profile `demo`, so it runs only with `--profile demo`; private key from `.env`, never committed |

Configuration comes from a `.env` file next to the compose file (`.env.example` committed); services read it only through `${VAR}` references, never through `env_file`. Every service uses `restart: unless-stopped`. TLS and the public domain sit in front of `web` (Dokploy with Traefik, or another host proxy) and are outside the compose file.

## 15. Testing

- `packages/core`: attribute decoding for all nine types, expression chunk builder.
- Indexer: backfill and per block apply against a fake RPC (recorded fixtures), snapshot and delta file contents, expiry sweep.
- Merge views: DuckDB (node) tests for the merge cases in section 8.
- Web: proxy and disk fallback, live tail, verify classification, views, playground and showcase rendering.
- Demo writer: action plan, writes against a fake client, configuration.
- Deployment: compose, Dockerfiles, `.env.example` and docs (`test/deployment.test.ts`).
- Manual smoke test against Tiramisu with the demo writer running.

## 16. Deliverables for the gates

Public MIT repository with setup in the README (wallet addresses, live URL and video placeholders, judge reproduction steps), `LICENSE`, `arkiv/schema.md`, `arkiv/friction.md`, a demo video of 3 minutes or less, CHANGELOG.md and DEVELOPER.md.

## 17. Build order (deadline driven)

1. Spike (section 5).
2. `packages/core` plus indexer backfill and snapshot.
3. Next.js with DuckDB WASM, base tables, SQL editor, dashboard.
4. Demo writer.
5. Live sync and delta, then browser delta polling.
6. Docker compose deploy (public URL), README, schema.md, friction.md, video.
7. P1: verify button, browser live tail (both done). P2: saved queries (not done).

## 18. Open decisions

- Host machine and public domain for the compose stack.
- Whether the public deployment indexes every entity (blank expression) or only the demo wallet (`$creator` expression).
