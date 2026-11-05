# Arkiv SQL Indexer: Specification

## Rabdi runtime (November 2026)

The runtime uses Arkiv SDK 1.0.1 on Rabdi, chain 7794095, with two second blocks and native currency tGLM. RPC authentication remains `Authorization: Bearer <key>`. Dated Tiramisu measurements and evidence describe the earlier network only.

`BACKFILL_MODE=scan` is the default. It scans latest state without credentials, splitting the key space into 16 equal ranges scanned 4 at a time. `query` performs the same scan with the API key and enables keyed live sync. `logs` replays from genesis and requires a provider retaining that history. Rabdi serves roughly the most recent 1,000 blocks of logs, so genesis replay is unsuitable for its public RPC. When a lagging checkpoint encounters unavailable logs, the indexer automatically builds and publishes a fresh store generation.

Rabdi has no historical state. Reads never send `atBlock`. Pages contain at most 100 entities. Cursors are bound to one block and cannot safely be reused across requests. Each range uses keyset pages ordered by `$key:key ASC`, with `$key >= key(<lo>)` on its first page and `$key > key(<last>)` on subsequent pages. A bounded range also includes `$key < key(<hi>)`. Bounds use full 32 byte hex keys. The final range has no upper bound. Nonblank expressions are parenthesized and joined to the bounds with `AND`. RPC reads run concurrently while store transactions are serialized. These are latest state walks, not atomic snapshots. Changes during a scan require subsequent log reconciliation within the retained window. Key lookups use chunks of at most 50 keys and one bounded page.

Entities have no native `payload` or `contentType`. Blobs are `bytes` attributes, up to 128 KiB. The SQL index stores only the first 32 bytes as hex in `attributes.value` and the full byte length in `attributes.num`; `content_type` remains NULL for compatibility. Widget, dashboard and link JSON is UTF8 encoded in an unindexed `payload` bytes attribute and fetched in full only for rendering. The indexed application attributes are `type`, `project`, `user`, `dashboard` and `widget`, where present. Other application attributes are unindexed. Strings are limited to 128 bytes and entities to 32 attributes.

RPC filters require indexed attributes, typed hex literals such as `addr()` and `key()`, `AND`, `OR`, `NOT` and `$expiresAt`. The removed forms `&&`, `||`, `~`, `!=` and `$expiration` must not be used. SDK creates use `(schema, values, { expiration })`; batch creates carry `schema`, `values`, `expiration` and optional `flags` and `salt`. Patches carry `schema`, `entityKey`, `set` and optional `unset`. Extensions use `entityKey` and `expiration`.


Status: implemented. The first version shipped on 18 October 2026; the challenge deadline was then extended to 20 October 2026, and sections marked 19 or 20 October record the later decisions. Git history: first commit `9ae759d` (18 October 2026, an empty scaffold with this spec and the plans), last commit 20 October 2026; no code predates it. Sections describe the current code. Where the original plan changed, the text says so. Since 20 October 2026 the project ships two parts: the open source, self hostable indexer and a web app that runs against the hosted indexer.

## 1. Summary

Two parts:

* **Indexer** (`apps/indexer`, MIT, self hostable with Docker Compose or Bun). Mirrors all Arkiv entities, or the subset matching `INDEX_EXPRESSION`, and publishes Parquet snapshots, a delta and a manifest over HTTP. The hosted instance at `https://arkiv-sql-indexer.dokploy.anshudhar.dev` indexes every entity on Rabdi.
* **Web app** (`apps/web`, hosted at `https://arkiv-sql.dokploy.anshudhar.dev`). Runs against the hosted indexer through the `/data` proxy (`INDEXER_URL`) and offers a SQL Playground, widgets and public dashboards stored as Arkiv entities, Featured dashboards kept live by the app wallet, Privy login and a keyed read only RPC proxy (`/api/rpc`).

In detail: a self hostable indexer mirrors the Arkiv entities matching one optional Arkiv query expression (blank means every entity) into immutable Parquet snapshots plus a small live delta. A Next.js frontend loads them into DuckDB WASM so anyone can run full SQL (joins, GROUP BY, ORDER BY on attributes, window functions) in their own browser. Expired data disappears from every layer: the snapshot excludes it, old snapshots are deleted, and the browser filters every row against the current chain head read directly from Arkiv RPC. A verify button checks any row against the chain.

## 2. Problem

`arkiv_query` supports typed filters and key ordering with at most 100 results per page. SQL joins and GROUP BY remain application concerns. Teams who want analytics must build their own indexer or trust someone else's, and typical indexers keep data forever, which breaks the expiry promise Arkiv makes.

## 3. Goals and non goals

Goals (P0 unless marked):

1. Index all entities matching a configured Arkiv expression, with backfill and live sync.
2. Publish versioned Parquet snapshots and a per block delta over HTTP.
3. Browser SQL over the merged data (snapshot, delta, live tail) through DuckDB WASM.
4. Featured dashboards (called Official until 20 October 2026) stored on Arkiv, with live charts and inspectable SQL (owner decision, 20 October 2026).
5. SQL editor with syntax highlighting and schema aware autocomplete.
6. Expiry enforced in the browser against the live chain head.
7. Removed on 20 October 2026 because widgets, dashboards and links now provide live application data through the dashboard wallet.
8. Verify button per row (P1).
9. Browser live tail (P1). Implemented as direct `eth_getLogs` polling decoded with SDK `ENTITY_EVENTS_ABI`, not `watchEntityEvents`.
10. Saved SQL widgets and shareable dashboards stored as Arkiv entities. Implemented with Privy login, a public explorer and personal home.

Non goals: server side SQL endpoint, history beyond current state, Parquet expiry buckets, DataFusion, DuckLake, multi expression indexes.

## 4. Historical Tiramisu facts (SDK `@arkiv-network/sdk` 0.8.1 source, read 18 October 2026)

- `arkiv_query(query, { atBlock?, select?, limit?, cursor? })`. `atBlock` reads past state "within the node's retained range". `limit` max 200. The cursor is bound to the query, block and selection, so a backfill pinned to one `atBlock` is a consistent snapshot.
- `select` fields: `key, owner, creator, createdAt, updatedAt, expiresAt, creationFlags, contentType, payload, attributeSchema, attributes`. All default off except `key`. `updatedAt` is selectable even though `$updatedAt` cannot be used as a predicate.
- `$key` works as a predicate: the SDK `getEntity` is `arkiv_query("$key = <key>", select "*", limit 1)`. There is no `arkiv_getEntity` call in the SDK.
- Attribute values arrive typed by tag: `i32` as a JSON number, `u64` and `u256` as `0x` quantities, `dec` as a decimal string, byte types as `0x` data, `str` as a string.
- `watchEntityEvents({ fromBlock?, pollingInterval?, onEvent, onError })` wraps viem `watchEvent` on `ARKIV_ADDRESS` (`0x4400000000000000000000000000000000000044`). Over an HTTP transport, or with `fromBlock`, it polls (default interval half a block); over a WebSocket transport without `fromBlock` viem uses an `eth_subscribe` push subscription (viem `actions/public/watchEvent.ts`, `enablePolling`). Events: `EntityCreated`, `EntityPatched`, `ExpiryExtended`, `OwnershipTransferred`, `EntityDeleted`, each with `blockNumber`, `transactionHash`, `logIndex`, `entityKey`.
- Block time is 2 seconds (`BLOCK_TIME` constant).
- Bun 1.3.11 runs `@duckdb/node-api` 1.5.6 and writes and reads Parquet (smoke tested). `COPY ... TO 'dir' (FORMAT parquet)` without `PARTITION_BY` writes a single file named `dir`, so always give a full file path.

- Live spike on Tiramisu, 18 October 2026 (chain ID 7738577, genesis `0x95488063112df36be71b4700200a1b18e2578317853f9d82af5c3da313a5ab71`, head about 742,800, about 30,478 live entities):
  - Query syntax uses `AND`, `OR`, `NOT` and typed literals, for example `$creator = addr(0x..) AND ($key = key(0x..) OR $key = key(0x..))`. Strings are `str('..')`. Build key filters with the SDK expression helpers, never by hand.
  - `arkiv_query` is cost metered. On 18 October 2026 the `RateLimit` header of an unauthenticated `arkiv_query` reported a budget per caller of `limit=10000` cost units, reset after about one hour (headers `RateLimit`, `Retry-After`, `Arkiv-Cost`, `Arkiv-Quota-Used-Percent`). This is a header reading, not a documented value; the Arkiv docs give no anonymous number. On 20 October 2026 the same header reported `limit=600, reset=60` and fell by one per request, so it now counts requests per 60 second window and no longer shows the cost budget ([friction report](arkiv/friction.md#anonymous-query-budget-and-error-envelope)). One broad query (`$expiresAt > u64(0)`, limit 5) used the whole budget. After that every `arkiv_query` returns HTTP 429 with body `{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}`, which is not a JSON-RPC error envelope.
  - `eth_blockNumber`, `eth_getLogs`, `arkiv_getEntityCount` and `arkiv_getBlockTiming` kept working while the query budget was exhausted. `eth_getLogs` over 5,000 blocks returned 12,797 logs in one call.
  - Consequences: queries must stay selective, and neither the indexer nor the browser may run `arkiv_query` per event. The first plan required an API key for the indexer; the later measurements in 7.1 made the indexer keyless by default. The browser uses `eth_blockNumber` for the live head and `eth_getLogs` for the change feed. Verify and payload fetches spend the visitor's own anonymous budget, one batched `$key` query per click. Since the `/api/rpc` read proxy (section 12), browser reads run through the web server and use `ARKIV_API_KEY` when it is set; without the key they share the web server's anonymous budget.

- With an API key (header `Authorization: Bearer <key>`, also accepted as `X-API-Key`; env `ARKIV_API_KEY`):
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
3. `watchEntityEvents` is not used. Both the indexer and the browser poll `eth_getLogs` directly, which gives explicit windows and checkpoints. Tested on 20 October 2026 over `wss://rpc.tiramisu.db-chain.testnet.arkiv.network`: the subscription delivered one batch per block while connected, but after a forced socket close viem resubscribed at the new head and 2 to 3 logs from the blocks mined during the reconnect were never delivered (`arkiv/friction.md`, WebSocket entity events). A window that restarts from a stored checkpoint cannot skip a block, so polling stays.
4. The browser uses a one row `live_head` table instead of `getvariable()`.
5. `expiresAt` is a block number, and an entity is live while `expiresAt > block`.

Surprises are recorded in `arkiv/friction.md` with versions and reproduction steps.

## 6. Architecture

```
Arkiv RPC (Rabdi, public endpoint)
   |  eth_getLogs (replay, live sync)              ^  eth_blockNumber, eth_getLogs (live tail), arkiv_query
   |  arkiv_query $key batches (fill)              |  (live attributes, payload, verify) via the web /api/rpc read proxy
   v                                               |
indexer (Bun, single process, self hostable)  browser (index files via the Next.js /data proxy to INDEXER_URL)
   DuckDB file, only writer                      DuckDB WASM in a worker
   snapshot builder  -> snap/v{n}/*.parquet ---> base tables
   delta writer      -> delta.json          ---> delta tables
   Bun.serve: manifest.json, snap, delta         live tables (from the live tail)
                                                 merged tables, public views filtered by live head
web backend app wallet -> Arkiv via SDK wallet client (creates widgets, dashboards, links; Featured keepalive)
browser Privy wallet    -> Arkiv public RPC (user signed widget extend, delete, transfer)
```

Monorepo with Bun workspaces:

```
packages/core       shared types, attribute decoding, expression helpers, row shapes
apps/indexer        sync, snapshot, delta, HTTP
apps/web            Next.js app: Playground, widgets, dashboards, /data and /api/rpc proxies
arkiv/schema.md     entity schema and exact queries
arkiv/friction.md   friction report
```

## 7. Indexer

### 7.1 Configuration (environment)

| Variable | Meaning | Default |
|---|---|---|
| `ARKIV_RPC_URL` | HTTP RPC | Rabdi public RPC |
| `INDEX_EXPRESSION` | Optional Arkiv query expression, blank means every entity | empty |
| `PUBLIC_RPC_URL` | Anonymous logs and chain metadata | Rabdi public RPC |
| `BACKFILL_MODE` | Latest scan, keyed query scan or retained log replay | `scan` |
| `FILL_RPC_URL` | RPC for attribute fills of pending rows | Rabdi public RPC |
| `FILL_USE_API_KEY` | send the API key with fills (spends monthly quota) | `false` |
| `SYNC_USE_API_KEY` | keyed live sync: key lookups on `ARKIV_RPC_URL` (spends monthly quota) | `false` |
| `FILL_CHUNK` | keys per fill query, at most 50 | 50 |
| `FILL_INTERVAL_MS` | pause between fill queries | 4000 |
| `ARKIV_API_KEY` | sent as `Authorization: Bearer`, server only; optional. The web server also uses it for the `/api/rpc` read proxy | empty (unused) |
| `SYNC_PAUSED` | serve existing store without RPC calls | `false` |
| `CONFIRMATIONS` | blocks behind head | 3 |
| `SYNC_BATCH_BLOCKS` | blocks per live sync batch | 5 |
| `SNAPSHOT_INTERVAL_BLOCKS` | blocks between snapshots | 30 (one minute) |
| `KEEP_SNAPSHOTS` | snapshot versions kept | 2 |
| `DATA_DIR` | output root | `./data` |
| `PORT` | HTTP port | 8080 |

Warn at startup when `INDEX_EXPRESSION` contains no `$creator` term, because user attributes can be written by anyone.

The API key is never sent by default. Only `BACKFILL_MODE=query`, `SYNC_USE_API_KEY=true` and `FILL_USE_API_KEY=true` send it; each requires `ARKIV_API_KEY` and startup fails with a clear message without it (unless `SYNC_PAUSED`). Startup logs `API key not used` or a warning naming the flags that enable it. No RPC client is constructed with the key unless one of these flags is set. Measured live rate on Tiramisu: about 2,800 distinct keys touched per hour (4,011 events per 1,800 blocks); keyed live sync at that rate would use roughly 25 to 35 percent of the monthly quota per day, while the anonymous budget the header showed on 18 October (10,000 units per hour, see §4) allows about 100 queries of up to 50 keys per hour.

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
  num DOUBLE,                        -- numeric types (approximate for u256 and dec), byte length for bytes
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

1. Record the confirmed head and its hash before scanning.
2. In `scan` mode, split the key space into 16 equal ranges scanned 4 at a time, reading latest entities with keyset pagination and serializing page writes into the store. Retry transient network errors and HTTP 429.
3. In `query` mode, use the same scan with the configured API key. In `logs` mode, replay retained genesis logs and populate pending rows. Rabdi public RPC cannot supply that history.
4. Check the original head hash, publish the snapshot and checkpoint, and reconcile subsequent changes through logs. A scan has no historical snapshot guarantee.
5. The filler reads pending keys at latest state and replaces attributes only while the pending row remains unchanged. HTTP 429 pauses fills until Retry After.

### 7.5 Live sync

Runs every `SYNC_BATCH_BLOCKS` blocks (default 5, about 10 seconds). By default (scan mode without `SYNC_USE_API_KEY`) sync is keyless:

1. `to = chainHead - CONFIRMATIONS`, `from = head_block + 1`. Skip when fewer than `SYNC_BATCH_BLOCKS` blocks are ready.
2. Fetch and decode logs as in step 2 below, then apply them in block and log order from log data alone, with no `arkiv_query`:
   * `EntityCreated` (passing the creator or owner prefilter of step 3): insert a log row with owner, creator, `created_at = updated_at = block`, `expires_at`, flags, `content_type NULL`, `attrs_pending = true`.
   * `EntityPatched`: keep the row and its attributes, set `attrs_pending = true` and `updated_at`.
   * `ExpiryExtended`: set `expires_at` and `updated_at`.
   * `OwnershipTransferred`: set `owner` and `updated_at`; with a non empty expression also set `attrs_pending = true` so the filler rechecks the filter.
   * `EntityDeleted`: remove the row and its attributes with a tombstone.
   * Events for keys without a row are ignored.
3. Every changed key gets `changes(to, key, false)`, so the delta carries it. Expiry sweep, hash checks and the checkpoint commit work as below, in one transaction.
4. The filler (7.4 step 5) fetches attributes for pending keys newest first, so new and patched keys come first. It writes a fetched row only if the row is still pending and its `updated_at` is not newer than the block it queried; otherwise the key stays pending and is fetched again at a newer block. A re-fetch replaces all attributes.

Limitation: with a filter expression that has no `$creator` or `$owner` term, keyless sync cannot see an existing entity that starts matching through a patch, nor one transferred into a `$owner` filter. Use `SYNC_USE_API_KEY=true` for such filters.

Keyed sync (`SYNC_USE_API_KEY=true` or `BACKFILL_MODE=query`):

1. `to = chainHead - CONFIRMATIONS`, `from = head_block + 1`. Skip when `to < from`.
2. `eth_getLogs` on `ARKIV_ADDRESS` for `[from, to]`, split into windows of at most 1,000 blocks; a `max results` error halves the window. Decode with the SDK `ENTITY_EVENTS_ABI`. The entity key is topic 1. For `EntityCreated` the owner is topic 2.
3. Relevance prefilter (SPECS §4): keep a touched key when it is already indexed, or when it was created in this batch by an owner the expression's `$creator`/`$owner` terms allow. When the expression has no such terms, keep every touched key.
4. Query `(<expr>) AND ($key = key(k1) OR ... OR $key = key(k50))` at latest state with `limit: 100`, 50 keys per call.
5. Keys returned: upsert entity, replace attributes, insert `changes(to, key, false)`.
6. Keys kept but not returned: the entity was deleted, expired, or stopped matching the filter. Delete it and insert `changes(to, key, true)`. This one rule handles deletes, patches that leave the filter, and transfers that leave a `$owner` filter. No local expression evaluator needed.
7. Commit the batch in one transaction, setting `head_block = to`. A batch with no relevant keys makes zero `arkiv_query` calls.

Every batch also runs the expiry sweep at `to`: `DELETE FROM entities WHERE expires_at <= to` (and matching attributes), recorded as tombstones in `changes`. Expiry emits no event, so the sweep is the only way the indexer forgets.

Provider limits (from the Arkiv indexing guide, observed on Tiramisu): `eth_getLogs` fails above 20,000 results (`-32602 query exceeds max results 20000`), so retry the suggested range or halve the window; JSON-RPC batches above 50 calls fail with HTTP 413; `-32006` means the requested block state is unavailable, so keep the checkpoint and never substitute head. The indexer stores the hash of `head_block` and rechecks it each batch; a mismatch (reorg or reset) triggers a fresh backfill into a new store generation. Confirmation lag is a policy, not finality.

If logs fall outside the roughly 1,000 block retention window, a capacity error on the lagging checkpoint triggers a fresh store generation. The active generation pointer changes after the replacement is published.

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
{ "schemaVersion": 1, "chainId": 60138453045, "genesisHash": "0x..", "expression": "$creator = 0x..",
  "version": 12, "snapshotBlock": 1200, "headBlock": 1217,
  "files": { "entities": "snap/v12/entities.parquet", "attributes": "snap/v12/attributes.parquet" },
  "delta": "delta.json", "live": 30700, "pending": 18200 }
```

`schemaVersion` versions the data contract (manifest fields, delta shape, Parquet columns) and is bumped only on a breaking change; additions keep it. Consumers refuse other versions, and a manifest without it reads as 1 (README, Compatibility). `live` counts entities alive at the head and `pending` those still waiting for attributes. The indexer rewrites these two counts after each fill; the browser shows a progress line while `pending` is above zero.

### 7.9 HTTP (Bun.serve)

| Path | Cache | Notes |
|---|---|---|
| `/manifest.json` | `no-cache` | ETag |
| `/delta.json` | `no-cache` | ETag, client polls every 2 s |
| `/snap/v{n}/*` | `public, max-age=300, immutable` | Range requests, versioned so never rewritten |
| `/health` | none | head lag, last snapshot, live and pending counts |

In Compose the indexer is internal (`expose` only). The hosted deployment also gives it a public domain so scripts and DuckDB can read it directly. It sends no CORS headers, so browsers reach it only through the Next.js proxy (9.0). Parquet URLs never change content, so range requests from DuckDB WASM can never mix two versions.

## 8. Browser data layer

1. Load DuckDB WASM from jsDelivr bundles (`mvp` or `eh`) in a worker. No threaded bundle, so no COOP or COEP headers are needed.
2. Fetch the manifest. Check `chainId` and genesis hash against the RPC, and show a banner on mismatch.
3. Import the snapshot into tables `base_entities` and `base_attributes` (data is small, so full import, no lazy views).
4. Poll `delta.json` every 2 s with `If-None-Match` and refetch the manifest about every 10 s. On change, replace `delta_entities`, `delta_attributes`, `delta_tombstones`. A delta whose `fromBlock` does not follow the manifest's snapshot block triggers a manifest refetch first.
5. Freshness comes from the browser live tail, read through the `/api/rpc` proxy (section 12), starting at `delta.toBlock + 1`. Poll logs every four seconds in windows of 1,000 blocks. Apply deletes, expiry extensions and transfers from logs. Creations and patches enter `live_pending`; fetch attributes with expression scoped batches of at most 50 keys (latest state, `limit` 50), at most once every 20 seconds. Use the indexed key and creation owner relevance prefilter from 7.5. HTTP 429 pauses attribute fetching until Retry-After while log updates continue. Failed requests never delete rows. Live rows compete with delta and base by updated block, with live winning ties. Pending rows keep previous attributes. Clear live tables on snapshot version change.

The backend may serve an existing store with `SYNC_PAUSED=true`, making no RPC calls and requiring no API key. Missing stores fail startup clearly. If the indexer is unreachable, the proxy serves the same files from a read only mount of the data directory (9.0). The optional API key is used by the keyed indexer modes (7.1) and by the web server's read proxy (section 12). It never reaches the browser.
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

A demo wide view (for example `widgets`) is a `PIVOT` over `attributes` for one `type`, defined in the browser, so no extra Parquet file is needed.

## 9. Frontend (Next.js)

- Next.js App Router with `output: 'standalone'` (a Node server, needed for the proxy). Pages are client components; DuckDB WASM runs only in the browser.
- Pages: `/` (story sections and live stats), `/explore` (public dashboards and widgets), `/playground` (SQL editor), `/about` (architecture and expiry), `/widgets/new` (create widget), `/widgets/<key>` (view or edit widget), `/d/<key>` (public dashboard), `/d/<key>/edit` (organize dashboard) and `/me` (login required home and activity). The former showcase route redirects to `/explore`, and `/widgets` to `/explore?tab=widgets`.
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

### 9.1 Featured dashboards

Owner decision, 20 October 2026: Featured dashboards (named Official in code) replace the showcase. The landing page shows up to six in seed order, and `/explore` lists public dashboards and widgets with a Featured only filter. Each report is a normal dashboard with widget and link entities on Arkiv, marked Featured when both its `user` attribute and its Arkiv owner equal the app wallet. Anyone may open the reports and import their widgets.

The reports are Arkiv network overview, Expiry watch, Creators, Attributes and Activity (`apps/web/lib/dash/official-defs.ts`). They cover network counters, creations, entity types, expiry distributions, creator rankings, attribute statistics and activity. Queries remain defined in `apps/web/lib/views.ts` for playground snippets and Featured definitions. Every chart runs SQL in the viewer's DuckDB and exposes that SQL. The app keeps Featured entities live automatically.

Block numbers convert to time at 2 seconds per block. Charts use Recharts or plain SVG.

### 9.2 SQL editor

- CodeMirror 6 through `@uiw/react-codemirror` with `@codemirror/lang-sql`. Syntax highlighting from the SQL language package.
- Autocomplete: table and column names read from `information_schema.columns` for the public views, passed as the `schema` option, plus SQL keywords and DuckDB function names from `duckdb_functions()`.
- Ctrl or Cmd plus Enter runs. Cancel button interrupts the running query. Results capped at 1,000 displayed rows with a note, and CSV download of the full result.
- Snippet sidebar with every Featured report query plus the featured JOIN and GROUP BY query "Most placed widgets", and a local query history.
- Query text kept in the URL hash so a query can be shared as a link.

### 9.3 Row actions

- Payload: fetched on demand from Arkiv RPC (`$key = key(k)`, select attributes, limit 1), never through the indexer.
- Verify (P1): when the result has a `key` column, batch query `$key = k` at head (chunks of 50, selection `key`, `updatedAt`, `expiresAt`, `owner`) and label each row `ok`, `stale`, `extended`, `expired` or `deleted`, or `present` when the result lacks `updated_at` and `expires_at`. The tooltip names the RPC URL and block checked and states that this is a consistency check, not a cryptographic proof, because `eth_getProof` is unavailable.

## 10. Application writer

The dashboard wallet is the only application writer. Widgets, dashboards and links replace the synthetic data generator removed on 20 October 2026. Entity attributes, lifetimes and operations are in `arkiv/schema.md`.

## 11. Widgets and dashboards

Implemented in `apps/web/lib/dash`, `components/widgets` and `app/api/dash`. Privy supports Google, Discord, X and Telegram with embedded Ethereum wallets. The backend wallet creates every widget, dashboard and placement link; the `user` attribute identifies widget authorship and application ownership for dashboards and links. The Arkiv owner decides widget ownership. Widgets save SQL, chart mappings, formatting and a chosen lifetime. Dashboards import widgets from any user with ordered size settings and at most 48 links. Public pages need no login; creation and ownership controls require a session.

Lists, usage counts and activity come from local DuckDB, scoped by creator and project. Payloads come from scoped Arkiv RPC key batches. Pending writes appear until the index catches up. Stored SQL passes the guard before running in the viewer's browser with at most 5,000 result rows. Home counts cover live entities only, placements include other users' links to your widgets, and active days count distinct creation and update days for your widgets and dashboards.

See the [design spec](docs/superpowers/specs/2026-10-20-widget-dashboards-design.md) for the feature design and [Arkiv schema](arkiv/schema.md#widget-dashboards) for implemented attributes, payloads, expiry, operations and exact read expressions. Dashboard and link edits use SDK `patchEntity`; widget edits create a new version.

### User owned widgets (owner decision, 20 October 2026)

User widgets are created by the app wallet with fixed `readonly` and `permissionlessExtension` flags and transferred to the session wallet in the same batch. The immutable `user` attribute records the author; the Arkiv owner controls deletion, transfer and saving new versions. Editing creates a new widget and repoints only the author's dashboard links. The old version stays until expiry unless its owner deletes it. Anyone logged in can extend a live user widget by signing in the browser. Extend, transfer and delete need GLM in the signing wallet; saving stays free. Legacy widgets owned by the app wallet have no user signing actions. Featured widgets require both `user` and `$owner` to equal the app wallet and use backend keepalive.

Dashboard covers (20 October 2026): a dashboard owner stars one widget in Organize, stored as the optional dashboard attribute `cover` (type `key`), and the dashboard card on Explore, Featured dashboards and My home renders that widget's live chart, with chart icons as the fallback. Organize sets it with a patch `set` and removes it with `unset: ['cover']` when the starred widget leaves the final layout; other attributes stay unchanged. List SQL accepts the cover only through a live link of the dashboard owner, so an unlinked, missing, expired or untrusted widget is ignored. Featured dashboards take their cover from `official-defs.ts`: the seed sets it at creation, `seed-official.ts --set-covers` reconciles existing ones (dry run aware), and keepalive reconciles them too.

Removed widget endpoints: `PUT /api/dash/widgets/[key]`, `DELETE /api/dash/widgets/[key]` and `POST /api/dash/widgets/[key]/extend`. New versions use `POST /api/dash/widgets` with `replaces`; widget extend, delete and transfer use direct browser signatures.

## 12. Security and abuse

- No server side SQL. Arbitrary queries run in the visitor's browser and only cost the visitor.
- The index expression controls published index data. Widget and dashboard reads also require the configured backend `$creator` and project, since attributes alone cannot establish identity. Startup warns when the expression has no `$creator` term.
- `ARKIV_API_KEY` reaches the indexer service (unused by default) and the web server runtime environment. It is never a `NEXT_PUBLIC_` variable, never a Docker build argument or `ARG`, and never part of the browser bundle. The deployment test asserts this for the compose files, the Dockerfiles and the web source tree (only `apps/web/lib/dash/server` may name it).
- Browser reads go through the same origin read proxy `POST /api/rpc`, which adds `Authorization: Bearer <ARKIV_API_KEY>` when the key is set and forwards anonymously otherwise. It accepts only the read methods `arkiv_query`, `eth_blockNumber`, `eth_chainId`, `eth_getBlockByNumber`, `eth_getLogs` and `eth_getBalance`; anything else (transactions, signing, debug or admin methods) gets a JSON RPC error with HTTP 400 and never reaches the upstream. Limits: 64 KB body (HTTP 413), batches of at most 20 calls, a 15 second upstream timeout (HTTP 504), and an in memory token bucket of 10 calls per second with a burst of 30 per client IP bucket (HTTP 429). Upstream status and body pass through; upstream headers other than `content-type` and `retry-after` are dropped, and the key is never echoed. Wallet signing and transactions keep the public RPC (`NEXT_PUBLIC_ARKIV_RPC_URL`) and never use the key.
- Server side dashboard reads (`arkiv_query` through the backend reader) also send the key when it is set; backend writes keep the public transport.
- The indexer serves static files and JSON only. The web app has write endpoints under `/api/dash`, authenticated through a verified Privy access token plus EIP 191 personal_sign of a single use nonce. The recovered signer must be a linked Privy embedded wallet. An HMAC signed HttpOnly session lasts eight hours, with SameSite=Lax and Secure on HTTPS.
- Writes enforce application ownership, JSON payload and SQL guard validation, same origin checks when Origin is supplied, and a serial backend wallet queue with at most 25 waiting jobs. Per address limits are 5 writes per minute and 40 per hour; the global limit is 80 per hour. Nonce requests allow 20 per minute per client IP bucket. Nonces expire after five minutes. State is in memory, so deploy one web instance.
- `PRIVY_APP_SECRET` and `DASHBOARD_PRIVATE_KEY` exist only in the web runtime environment. `NEXT_PUBLIC_PRIVY_APP_ID` is public at build and runtime. `GET /api/dash/config` derives the public wallet address at runtime; no public wallet build variable is needed.

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

Configuration comes from a `.env` file next to the compose file (`.env.example` committed); services read it only through `${VAR}` references, never through `env_file`. Every service uses `restart: unless-stopped`. TLS and the public domain sit in front of `web` (Dokploy with Traefik, or another host proxy) and are outside the compose file.

Dashboard environment:

| Variable | Scope | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Web build and runtime | Privy app ID; blank disables dashboards |
| `PRIVY_APP_SECRET` | Web runtime only | Privy verification and session HMAC |
| `DASHBOARD_PRIVATE_KEY` | Web runtime only | Funded backend dashboard wallet |
| `NEXT_PUBLIC_ARKIV_RPC_URL` | Web build and runtime | Public RPC for wallet signing, backend writes and the `/api/rpc` upstream |
| `NEXT_PUBLIC_EXPLORER_URL` | Web build and runtime | Block explorer for address links |
| `ARKIV_API_KEY` | Web runtime only (and indexer) | Optional key for `/api/rpc` and server dashboard reads |
| `INDEXER_URL` | Web runtime | `/data` proxy upstream, `http://indexer:8080` in Compose |

Secrets are never build arguments, and the Privy secret and wallet key never reach the indexer. Production runs on Dokploy with `docker-compose.dokploy.yml`: the app at `https://arkiv-sql.dokploy.anshudhar.dev` and the indexer at `https://arkiv-sql-indexer.dokploy.anshudhar.dev`, with a blank expression. Filtered self hosted indexes must include the dashboard creator with `OR`; changing the expression requires a fresh data directory and full backfill.

## 15. Testing

- `packages/core`: attribute decoding for all nine types, expression chunk builder.
- Indexer: backfill and per block apply against a fake RPC (recorded fixtures), snapshot and delta file contents, expiry sweep.
- Merge views: DuckDB (node) tests for the merge cases in section 8.
- Web: proxy and disk fallback, read proxy, live tail, verify classification, views, playground and Featured dashboards rendering.
- Deployment: compose, Dockerfiles, `.env.example` and docs (`test/deployment.test.ts`).
- Manual smoke test against Rabdi using widget creation and dashboard placement.

## 16. Deliverables for the gates

Public MIT repository with setup in the README (wallet addresses, live URL and video placeholders, judge reproduction steps), `LICENSE`, `arkiv/schema.md`, `arkiv/friction.md`, a demo video of 3 minutes or less, CHANGELOG.md and DEVELOPER.md.

## 17. Build order (deadline driven)

1. Spike (section 5).
2. `packages/core` plus indexer backfill and snapshot.
3. Next.js with DuckDB WASM, base tables, SQL editor, dashboard.
4. Widget dashboard application writes.
5. Live sync and delta, then browser delta polling.
6. Docker compose deploy (public URL), README, schema.md, friction.md, video.
7. P1: verify button, browser live tail (both done). Widgets and dashboards are implemented (section 11).

## 18. Open decisions

- Resolved: the compose stack runs on Dokploy (section 14).

Production indexes every entity with a blank expression. Self hosters may scope to the dashboard wallet.

## Theme and shell

Owner decisions of 20 October 2026 apply the console theme throughout the app, with dark and light mode, a calm navbar and the status bar on every page. Dashboards use a report view with numbered figures and a share menu for Copy link and Post on X. Chart types include stacked bar and histogram; time ranges are removed. Explore has Dashboards and Widgets tabs. Featured dashboards and widgets are authored by Arkiv SQL Indexer and maintained by automatic keepalive. Featured widgets show Kept live and offer no Extend action.
