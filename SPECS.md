# Arkiv SQL Indexer: Specification

Status: draft, 18 October 2026. Submission deadline 18 October 2026, 22:59 UTC.

## 1. Summary

A self hosted indexer that mirrors the Arkiv entities matching one Arkiv query expression into immutable Parquet snapshots plus a small live delta. A Next.js frontend loads them into DuckDB WASM so anyone can run full SQL (joins, GROUP BY, ORDER BY on attributes, window functions) in their own browser. Expired data disappears from every layer: the snapshot excludes it, old snapshots are deleted, and the browser filters every row against the current chain head read directly from Arkiv RPC. A verify button checks any row against the chain.

## 2. Problem

`arkiv_query` supports boolean filters only: newest first, at most 200 results per page, no joins, no GROUP BY, no ORDER BY on attributes, no aggregation beyond count. Teams who want analytics must build their own indexer or trust someone else's, and typical indexers keep data forever, which breaks the expiry promise Arkiv makes.

## 3. Goals and non goals

Goals (P0 unless marked):

1. Index all entities matching a configured Arkiv expression, with backfill and live sync.
2. Publish versioned Parquet snapshots and a per block delta over HTTP.
3. Browser SQL over the merged data (snapshot, delta, live tail) through DuckDB WASM.
4. Dashboard with fixed analytics tiles, each showing its SQL.
5. SQL editor with syntax highlighting and schema aware autocomplete.
6. Expiry enforced in the browser against the live chain head.
7. Demo writer app that writes through the SDK (per type expiry, `extendEntity`, batch writes, ownership transfer).
8. Verify button per row (P1).
9. Browser live tail via `watchEntityEvents` (P1).
10. Saved queries stored as Arkiv entities (P2).

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
  - Consequences: the indexer needs an API key (`ARKIV_API_KEY`) and must keep queries selective; the browser must not run `arkiv_query` per event. The browser uses `eth_blockNumber` for the live head and `eth_getLogs` for the change feed only. Verify and payload fetches spend the visitor's own anonymous budget, one `$key` query per click.

- With an API key (header `Authorization: Bearer <key>`, also accepted as `X-API-Key`; env `TIRAMISU_API_KEY`):
  - Every `arkiv_query` costs a flat 100 units (`Arkiv-Cost: 100`), whether it is one key, 50 OR'ed keys, a full 200 row page with all fields, or a request that fails. Cost is per call, so batching is free.
  - A short term limit (`RateLimit: limit=9999 ... reset=1`) plus a monthly quota (`Arkiv-Quota-Used-Percent`, which read 1 after about 20 calls). The quota size is unknown, so the indexer must minimise calls and log the quota header.
  - An OR of 50 `$key = key(..)` terms (about 4,100 characters) works. 100 terms (about 8,200 characters) fails with `-32004 query is too long`. Chunk size: 50 keys.
  - `atBlock` 200,000 blocks back (about 4.6 days) works.
  - Responses carry `updatedAt`, `expiresAt`, `createdAt` as hex quantities, `creationFlags` as `{readonly, permissionlessExtension, raw}`, attributes as `{name, type, value}` with `u64` as a hex quantity.
  - Chain wide churn is high (about 115 distinct keys touched per 60 blocks, mostly load test traffic), so the indexer must not query every touched key.
- Sync consequence (relevance prefilter): the indexer keeps the set of indexed keys. A touched key is queried only when it is already indexed, or when its `EntityCreated` log owner (topic 2) passes the expression's `$creator`/`$owner` terms. With no such terms, every touched key is queried. Queries run at most once per `SYNC_BATCH_BLOCKS` (default 5) blocks, in chunks of 50 keys, with `atBlock` set to the last block of the batch.

## 5. To verify on Tiramisu first (spike, 30 minutes)

1. How far back `atBlock` is retained.
2. Maximum length of `(<expr>) AND ($key = key(k1) OR ... OR $key = key(kN))`. Pick a chunk size.
3. `watchEntityEvents` with `fromBlock` over an HTTP transport on Tiramisu.
4. `getvariable()` available in the DuckDB WASM build in use. Fallback: a one row `head` table.
5. Whether `expiresAt` is a block number (assumed) and the exact liveness rule `expiresAt > block`.

Record every surprise in `arkiv/friction.md` with versions and reproduction steps.

## 6. Architecture

```
Arkiv RPC (Tiramisu)
   |  arkiv_query (backfill, per block re-query)       ^  eth_blockNumber, watchEntityEvents,
   |  watchEntityEvents (fromBlock)                    |  arkiv_query (payload, verify, live tail)
   v                                                   |
indexer (Bun, single process)                     browser (via Next.js /data proxy)
   DuckDB file, only writer                          DuckDB WASM in a worker
   snapshot builder  -> snap/v{n}/*.parquet  ---->   base tables
   delta writer      -> delta.json           ---->   delta tables
   Bun.serve: manifest.json, snap, delta             live tables (from watch)
                                                     merged views, filtered by live head
demo writer (Bun script, published testnet wallet) -> Arkiv via SDK
```

Monorepo with Bun workspaces:

```
packages/core       shared types, attribute decoding, expression helpers, row shapes
apps/indexer        sync, snapshot, delta, HTTP
apps/web            Next.js dashboard and SQL editor
apps/demo-writer    synthetic data generator using the SDK
arkiv/schema.md     gate 4
arkiv/friction.md   gate 5
```

## 7. Indexer

### 7.1 Configuration (environment)

| Variable | Meaning | Default |
|---|---|---|
| `ARKIV_RPC_URL` | HTTP RPC | Tiramisu public RPC |
| `INDEX_EXPRESSION` | Arkiv query expression | required |
| `TIRAMISU_API_KEY` | sent as `Authorization: Bearer` | required |
| `CONFIRMATIONS` | blocks behind head | 3 |
| `SYNC_BATCH_BLOCKS` | blocks per live sync batch | 5 |
| `SNAPSHOT_INTERVAL_BLOCKS` | blocks between snapshots | 30 (one minute) |
| `KEEP_SNAPSHOTS` | snapshot versions kept | 2 |
| `DATA_DIR` | output root | `./data` |
| `PORT` | HTTP port | 8080 |

Warn at startup when `INDEX_EXPRESSION` contains no `$creator` term, because user attributes can be written by anyone.

### 7.2 Store identity

On startup read `eth_chainId` and the hash of block 0. The store lives at `DATA_DIR/<chainId>-<genesisHash first 10 hex>/`. A chain reset with the same chain ID gets a new store. If the stored expression differs from the configured one, refuse to start and print the fix (delete the store or restore the expression).

### 7.3 DuckDB schema (indexer side)

```sql
CREATE TABLE entities (
  key VARCHAR PRIMARY KEY,           -- 0x hex, lowercase
  owner VARCHAR, creator VARCHAR,
  created_at UBIGINT, updated_at UBIGINT, expires_at UBIGINT,
  content_type VARCHAR, creation_flags INTEGER,
  payload_size INTEGER               -- payload itself stays off SQL
);
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
  snapshot_version INTEGER, snapshot_block UBIGINT
);
```

`payload_size` needs the payload once at ingest. If that costs too much over RPC, drop the column.

### 7.4 Backfill

1. `B0 = head - CONFIRMATIONS`.
2. Page `arkiv_query(INDEX_EXPRESSION, { atBlock: B0, select: all except payload plus payload if payload_size kept, limit: 200 })` until no cursor.
3. Upsert entities and replace their attributes in one transaction per page.
4. Set `start_block = head_block = B0`, then build snapshot v1 (7.6).

### 7.5 Live sync

Runs every `SYNC_BATCH_BLOCKS` blocks (default 5, about 10 seconds):

1. `to = chainHead - CONFIRMATIONS`, `from = head_block + 1`. Skip when `to < from`.
2. `eth_getLogs` on `ARKIV_ADDRESS` for `[from, to]`, split into windows of at most 1,000 blocks. Decode with the SDK `ENTITY_EVENTS_ABI`. The entity key is topic 1. For `EntityCreated` the owner is topic 2.
3. Relevance prefilter (SPECS §4): keep a touched key when it is already indexed, or when it was created in this batch by an owner the expression's `$creator`/`$owner` terms allow. When the expression has no such terms, keep every touched key.
4. Query `(<expr>) AND ($key = key(k1) OR ... OR $key = key(k50))` with `atBlock: to`, 50 keys per call.
5. Keys returned: upsert entity, replace attributes, insert `changes(to, key, false)`.
6. Keys kept but not returned: the entity was deleted, expired, or stopped matching the filter. Delete it and insert `changes(to, key, true)`. This one rule handles deletes, patches that leave the filter, and transfers that leave a `$owner` filter. No local expression evaluator needed.
7. Commit the batch in one transaction, setting `head_block = to`. A batch with no relevant keys makes zero `arkiv_query` calls.

Every batch also runs the expiry sweep at `to`: `DELETE FROM entities WHERE expires_at <= to` (and matching attributes), recorded as tombstones in `changes`. Expiry emits no event, so the sweep is the only way the indexer forgets.

Provider limits (from the Arkiv indexing guide, observed on Tiramisu): `eth_getLogs` fails above 20,000 results (`-32602 query exceeds max results 20000`), so halve the window and retry; JSON-RPC batches above 50 calls fail with HTTP 413; `-32006` means the requested block state is unavailable, so keep the checkpoint and never substitute head. The indexer stores the hash of `head_block` and rechecks it each batch; a mismatch (reorg or reset) triggers a fresh backfill into a new store generation. Confirmation lag is a policy, not finality.

If `atBlock` falls outside the retained range (indexer down too long), fall back to a fresh backfill into a new store.

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
  "delta": "delta.json" }
```

### 7.9 HTTP (Bun.serve)

| Path | Cache | Notes |
|---|---|---|
| `/manifest.json` | `no-cache` | ETag |
| `/delta.json` | `no-cache` | ETag, client polls every 2 s |
| `/snap/v{n}/*` | `public, max-age=300, immutable` | Range requests, versioned so never rewritten |
| `/health` | none | head lag, last snapshot |

The indexer is not exposed publicly. The browser reaches it only through the Next.js proxy (9.0), so no CORS headers are needed. Parquet URLs never change content, so range requests from DuckDB WASM can never mix two versions.

## 8. Browser data layer

1. Load DuckDB WASM from jsDelivr bundles in a worker. Single threaded bundle, so no COOP or COEP headers are needed.
2. Fetch the manifest. Check `chainId` and genesis hash against the RPC, and show a banner on mismatch.
3. Import the snapshot into tables `base_entities` and `base_attributes` (data is small, so full import, no lazy views).
4. Poll `delta.json` with `If-None-Match`. On change, replace `delta_entities`, `delta_attributes`, `delta_tombstones`.
5. P1: `watchEntityEvents({ fromBlock: delta.toBlock + 1 })` in the browser. Per block, re-query touched keys with the expression at that block, exactly as in 7.5, into `live_*` tables. Applied rows older than the loaded version are skipped by the merge.
6. Poll `eth_blockNumber` every 2 s and store it as `live_head`.

Public views (the only names shown in autocomplete docs):

```sql
CREATE VIEW entities AS
SELECT * EXCLUDE (rn, deleted, src) FROM (
  SELECT *, row_number() OVER (PARTITION BY key ORDER BY updated_at DESC, src DESC) rn
  FROM (
    SELECT *, false deleted, 0 src FROM base_entities
    UNION ALL BY NAME SELECT *, false, 1 FROM delta_entities
    UNION ALL BY NAME SELECT key, block updated_at, true, 1 FROM delta_tombstones
    UNION ALL BY NAME SELECT *, false, 2 FROM live_entities
    UNION ALL BY NAME SELECT key, block updated_at, true, 2 FROM live_tombstones))
WHERE rn = 1 AND NOT deleted AND expires_at > getvariable('live_head');

CREATE VIEW attributes AS
SELECT a.* FROM newest_attributes a JOIN entities USING (key);
```

`newest_attributes` takes all attributes of a key from the source (base, delta, live) that won in `entities`, so a patch that removes an attribute removes it here too. The exact SQL is left to the implementation plan, and it needs unit tests for: patch, delete, delete then recreate, extend, leave filter, expire.

A demo wide view (for example `tickets`) is a `PIVOT` over `attributes` for one `type`, defined in the browser, so no extra Parquet file is needed.

## 9. Frontend (Next.js)

- Next.js App Router with `output: 'standalone'` (a Node server, needed for the proxy). Pages are client components; DuckDB WASM runs only in the browser.
- Header: chain, indexed expression, `$creator` filter state, snapshot version, "as of block N", head lag.

### 9.0 Data proxy

The browser loads all index data from the Next.js origin under `/data/*`. A route handler `app/data/[...path]/route.ts` forwards each request to `INDEXER_URL` (runtime environment variable, default `http://indexer:8080`):

- Forwards request headers `Range`, `If-None-Match`, `If-Modified-Since`.
- Returns the upstream status unchanged (200, 206, 304, 404) and copies `Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`, `ETag`, `Cache-Control`.
- Streams the body (`new Response(upstream.body, ...)`), never buffers it.
- `export const dynamic = 'force-dynamic'` and `fetch(..., { cache: 'no-store' })` so Next.js never caches a mutable file such as `manifest.json` or `delta.json`.
- Allows only `manifest.json`, `delta.json` and `snap/v{n}/{entities,attributes}.parquet` paths, and rejects anything else with 404 (no open proxy).

A route handler is used instead of `rewrites()` in `next.config` because rewrites are fixed at build time (the indexer URL could not change per deployment) and their forwarding of `Range` and conditional headers would need separate verification. Test: a `curl -H 'Range: bytes=0-99'` through the proxy returns 206 with the same bytes as the indexer.

### 9.1 Dashboard

Tiles, each with a "View SQL" link that opens the query in the editor:

1. Live entities (count) and entities expiring in the next hour.
2. Entities by `type` attribute (bar).
3. Creations per hour, last 24 hours (blocks converted to time via `arkiv_getBlockTiming`).
4. Expiry horizon histogram (how long until data disappears).
5. Top creators by entity count, linked to `$creator`.
6. Recent changes feed (from delta and live tables), showing create, patch, extend, transfer, delete as they land.

Charts: one small library (Recharts) or plain SVG.

### 9.2 SQL editor

- CodeMirror 6 through `@uiw/react-codemirror` with `@codemirror/lang-sql`. Syntax highlighting from the SQL language package.
- Autocomplete: table and column names read from `information_schema.columns` for the public views, passed as the `schema` option, plus SQL keywords and DuckDB function names from `duckdb_functions()`.
- Ctrl or Cmd plus Enter runs. Cancel button interrupts the running query. Results capped at 1,000 displayed rows with a note, and CSV download of the full result.
- Example queries dropdown, including one join and one GROUP BY that `arkiv_query` cannot express.
- Query text kept in the URL hash so a query can be shared as a link.

### 9.3 Row actions

- Payload: fetched on demand from Arkiv RPC (`$key = k`, select payload), never through the indexer.
- Verify (P1): when the result has a `key` column, batch query `$key = k` at head with all fields and label each row `ok`, `stale` (chain `updatedAt` newer, show diff), `extended`, `expired`, or `deleted`. The UI states "matches RPC <url>", not a cryptographic proof, because `eth_getProof` is unavailable. The RPC URL is user editable.

## 10. Demo writer

Bun script using `@arkiv-network/sdk` with a published testnet wallet (synthetic data only, address listed in README). Default domain: a support desk.

| Type | Expiry | Writes |
|---|---|---|
| `ticket` | 7 days | created with its first `comment` in one batch; status patched; ownership transferred to an agent wallet on assignment |
| `comment` | 1 day | each new comment extends its ticket (`extendEntity` as a lease renewed by activity) |
| `heartbeat` | 10 minutes | shows expiry visibly removing rows within the demo video |

Runs continuously at a low rate so the dashboard moves. The domain is an open decision; the indexer does not depend on it.

## 11. Saved queries on Arkiv (P2)

Entity type `saved_query`: scratch 1 day, pinned dashboard 30 days, extended on view. Author shown via `$creator`. Needs a browser wallet, so it is last in priority.

## 12. Security and abuse

- No server side SQL. Arbitrary queries run in the visitor's browser and only cost the visitor.
- The only access control is the indexed expression. Only entities matching it are published, so `$creator` filtering is the Security track story.
- The indexer serves static files and JSON only. No write endpoints.

## 13. Expiry guarantee (what we claim)

The index never serves an expired row:

1. Snapshots exclude rows with `expires_at <= head` at build time.
2. Old snapshots are deleted after `KEEP_SNAPSHOTS` versions, and the indexer DB sweeps expired rows.
3. The browser hides any row with `expires_at <= live_head`, where `live_head` comes from Arkiv RPC, not from the indexer.

We do not claim that a consumer cannot copy data while it is live. No index can promise that.

## 14. Deployment

One `docker-compose.yml` at the repository root, run with `docker compose up -d --build`:

| Service | Image | Port | Notes |
|---|---|---|---|
| `indexer` | `oven/bun` based, builds `apps/indexer` | 8080, internal only (`expose`, no `ports`) | named volume `index-data` at `/data`; healthcheck on `/health` |
| `web` | `node` based, Next.js standalone build of `apps/web` | `3000:3000` public | `INDEXER_URL=http://indexer:8080`; `depends_on: indexer (service_healthy)` |
| `demo-writer` | `oven/bun`, `apps/demo-writer` | none | compose profile `demo`, so it runs only with `--profile demo`; private key from `.env`, never committed |

Configuration comes from a `.env` file next to the compose file (`.env.example` committed). Both long running services use `restart: unless-stopped`. TLS and the public domain sit in front of `web` (Caddy or the host's proxy) and are outside the compose file.

## 15. Testing

- `packages/core`: attribute decoding for all nine types, expression chunk builder.
- Indexer: backfill and per block apply against a fake RPC (recorded fixtures), snapshot and delta file contents, expiry sweep.
- Merge views: DuckDB (node) tests for the six cases in section 8.
- Smoke test against Tiramisu with the demo writer running.

## 16. Deliverables for the gates

README (setup, wallet addresses, demo URL), MIT licence, `arkiv/schema.md`, `arkiv/friction.md`, demo video of 3 minutes or less, CHANGELOG.md, DEVELOPER.md.

## 17. Build order (deadline driven)

1. Spike (section 5).
2. `packages/core` plus indexer backfill and snapshot.
3. Next.js with DuckDB WASM, base tables, SQL editor, dashboard.
4. Demo writer.
5. Live sync and delta, then browser delta polling.
6. Docker compose deploy (public URL), README, schema.md, friction.md, video.
7. P1: verify button, browser live tail. P2: saved queries.

## 18. Open decisions

- Demo domain (default: support desk).
- Host machine for the compose stack and public domain.
- Whether to index the 41 hackathon projects' wallets in addition to the demo writer wallet.
