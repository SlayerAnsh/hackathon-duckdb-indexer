# Developer guide

Use Bun 1.3.x (tested with 1.3.11). Docker uses `oven/bun:1.3` for workspace installation and the indexer and writer, and `node:22-slim` for the Next.js standalone runtime. Key versions from `bun.lock`: `@arkiv-network/sdk` 0.8.1, viem 2.57.3, `@duckdb/node-api` 1.5.6-r.1 (indexer), `@duckdb/duckdb-wasm` 1.33.1-dev57.0 (browser), Next.js 16.4.2, React 19.3.0, `@codemirror/lang-sql` 6.10.0 with `@uiw/react-codemirror`, Recharts 3.

## Workspace layout

| Path | Responsibility |
| :--- | :--- |
| `packages/core` | Direct JSON RPC client, typed attribute decoding, `$key` chunk builder, browser merge views |
| `apps/indexer` | DuckDB store, log replay backfill, attribute filler, live sync, snapshots, delta, internal HTTP |
| `apps/web` | Next.js data proxy with disk fallback, DuckDB WASM loader, browser live tail, showcase, playground, about page |
| `apps/demo-writer` | Synthetic support desk mutations through the Arkiv SDK wallet client |
| `arkiv` | Entity schema, exact queries, and the friction report |
| `test/deployment.test.ts` | Offline deployment and documentation checks |

From the repository root:

```sh
bun install
bun test ./test/deployment.test.ts
bun test ./packages/core/test
bun test ./apps/indexer/test
bun test ./apps/web/test
bun test ./apps/demo-writer/test
```

All automated tests use fixtures or fakes and need no RPC. The deployment tests inspect configuration and docs, not running containers. They also reject dash punctuation in the docs. Docker image builds, Range responses, credential absence in built bundles, restart persistence and public deployment need separate integration checks.

Start the frontend with `INDEXER_URL=http://localhost:8080 bun run --cwd apps/web dev` when using a local indexer (`DATA_DIR=./data bun apps/indexer/src/main.ts`). The default upstream inside Compose is `http://indexer:8080`. Set `DATA_DIR` for the web app too if it should fall back to the stored files while the indexer is down.

## Data layout

```text
<DATA_DIR>/<chainId>-<genesisHash first 10 hex chars>[-g<n>]/
  index.duckdb
  manifest.json
  delta.json
  snap/v<n>/entities.parquet
  snap/v<n>/attributes.parquet
```

In Compose `DATA_DIR=/data` is a bind mount of the host path `INDEX_DATA_PATH` (default `./data`). The web container mounts the same path read only. Chain ID and genesis hash identify a store, and a changed expression refuses reuse. A reorg, chain reset or unavailable historical state builds a fresh generation `-g<n>` and switches to it through `active-generation.json`. A completed backfill checkpoint permits restart without repeating backfill. Keep one indexer writer per data directory. Never edit a published snapshot in place.

## Backfill and fill

In the default logs mode, backfill replays public logs from block zero to one confirmed block, committing each adaptive window (starting at 20,000 blocks) with its checkpoint. It computes live keys in SQL, writes every live key from log data with `attrs_pending = true`, then writes the first snapshot and checkpoint. `apps/indexer/src/fill.ts` fills attributes newest first beside live sync. The sync tick and the filler share one store lock, and RPC calls run outside it. Pending state lives in `entities`, so a restart resumes filling where it stopped. Keys the RPC does not return move behind untried keys (`fill_misses`). `BACKFILL_MODE=query` pages the expression at one confirmed block instead.

## Live sync

A live batch spans the checkpoint plus one through the confirmed chain head and runs when at least `SYNC_BATCH_BLOCKS` (default 5) blocks are ready. Logs come from the Arkiv contract in windows of at most 1,000 blocks.

By default (`syncLogs` in `apps/indexer/src/sync.ts`) no API key is used and no `arkiv_query` runs during sync. Events apply in block and log order. Creations allowed by the creator or owner prefilter insert a pending log row. Patches set `attrs_pending` and `updated_at` while keeping the old attributes. Extensions update `expires_at`. Transfers update `owner` (and mark the row pending under a filter expression). Deletions remove the row with a tombstone. Each changed key gets one change row at the batch end. The filler writes a fetched row only while the row is still pending and its `updated_at` is not newer than the block it queried; otherwise the key stays pending and is fetched again later. `createClients` in `main.ts` builds every RPC client, and only a keyed opt in gives a client the key. `apps/indexer/test/keyless.test.ts` asserts that no request carries `Authorization` or `X-API-Key` through bootstrap, ticks and fills.

With `SYNC_USE_API_KEY=true` or `BACKFILL_MODE=query` the keyed path (`syncBatch`) runs instead. It deduplicates touched keys and retains indexed keys plus relevant creations allowed by creator or owner terms (all touched keys without such terms), queries them in chunks of 50 at the batch end with the configured expression, upserts returned entities, replaces their attributes, and removes absent keys with tombstones.

Both paths sweep `expires_at <= batchEnd` even when no events arrive, check the batch end block hash, and commit the batch and checkpoint together. The delta is then published atomically.

## Snapshots, HTTP and browser

Every `SNAPSHOT_INTERVAL_BLOCKS` (default 30) the indexer publishes new versioned Parquet files with live rows and atomically replaces the manifest. It keeps `KEEP_SNAPSHOTS` (default two) versions and prunes older ones. Snapshot file paths must end in `.parquet` because DuckDB COPY without partitioning writes a file, not a directory. The internal HTTP server on port 8080 serves `/health`, `/manifest.json`, `/delta.json` and `/snap/v<n>/{entities,attributes}.parquet` with Range and ETag support. During bootstrap, `/health` returns 200 with `bootstrapping: true` and null block and snapshot fields while data paths return 503 until bootstrap completes.

The web proxy (`apps/web/lib/proxy.ts`) forwards only those paths with Range and conditional request headers. When `DATA_DIR` is set and the indexer is unreachable or returns 502, 503 or 504, it serves the same files from disk with `x-served-by: disk`; without `DATA_DIR` it returns 502.

In the browser (`apps/web/lib/indexdb.ts`), internal merge views combine the snapshot, delta updates, tombstones and the live tail. `MATERIALIZE_SQL` refreshes `merged_entities` and `merged_attributes` in the same transaction and serial section as every snapshot load, delta replacement, live tail apply and live table clear. The public `entities` and `attributes` views filter expiry at query time against a head read directly from RPC, so head updates alone need no refresh. Live pending keys keep previous attributes until their fetched attributes arrive. Showcase and playground queries share the write queue. Run `bun apps/web/scripts/bench-views.ts` for the offline native DuckDB comparison of every widget and both refresh strategies.

## Deployment verification

Use the README setup and wait for the health check. Check `/data/manifest.json` through port 3000 and request `Range: bytes=0-99` for a Parquet file named in the manifest; expect 206. Restart the stack without deleting the data directory and confirm checkpoint reuse. Stop the indexer and confirm the web app still serves stored data from disk. Verify the API key is absent from the built `.next` files without printing the key. Check that the indexer log says `API key not used` unless a keyed mode was chosen deliberately. Default startup must leave the writer stopped. TLS belongs in the host proxy, outside Compose.
