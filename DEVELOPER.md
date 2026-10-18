# Developer guide

Use Bun 1.3.x, tested with 1.3.11. Docker uses Bun 1.3 for workspace installation and indexer execution, and Node 22 for the Next.js standalone runtime. The indexer uses `@duckdb/node-api` 1.5.6; browser SQL uses DuckDB WASM.

## Workspace layout

| Path | Responsibility |
| :--- | :--- |
| `packages/core` | RPC, typed attribute decoding, query chunking, merge views |
| `apps/indexer` | DuckDB store, backfill, snapshots, live sync, internal HTTP |
| `apps/web` | Next.js proxy, browser data loader, dashboard and SQL editor |
| `apps/demo-writer` | Synthetic support desk mutations through Arkiv SDK |
| `arkiv` | Schema and provider friction reports |
| `test/deployment.test.ts` | Offline deployment and documentation checks |

From the repository root with dependencies installed:

```sh
bun test ./test/deployment.test.ts
bun test ./packages/core/test
bun test ./apps/indexer/test
bun test ./apps/web/test
bun test ./apps/demo-writer/test
```

All automated tests use fixtures or fakes and need no RPC. The deployment tests inspect configuration, not running containers. Docker image builds, Range responses, credential absence in built bundles, restart persistence, and public deployment require separate integration verification. Start the local frontend with `bun run --cwd apps/web dev` and set `INDEXER_URL=http://localhost:8080` when using a local indexer. Its default container upstream is `http://indexer:8080`.

## Data layout

```text
<DATA_DIR>/<chainId>-<genesisHash first 10 hex chars>/
  index.duckdb
  manifest.json
  delta.json
  snap/v<n>/entities.parquet
  snap/v<n>/attributes.parquet
```

`DATA_DIR=/data` in Compose is backed by the named `index-data` volume. Chain ID and genesis hash identify a store; changing the expression refuses reuse. A completed backfill checkpoint permits restart without repeating backfill. Keep one indexer writer per volume. Never edit a published snapshot in place.

## Batch sync

Initial backfill in the default logs mode replays public logs to one confirmed block (resumable per window), writes every live key from log data with `attrs_pending = true`, then writes the first snapshot and checkpoint. `apps/indexer/src/fill.ts` fills attributes newest first beside live sync; the sync tick and the filler share one store lock, and RPC calls run outside it. Pending state lives in `entities`, so a restart resumes filling where it stopped. `BACKFILL_MODE=query` pages the expression at one confirmed block instead; an interrupted query backfill is cleared and restarted.

A live batch spans the checkpoint plus one through the confirmed chain head. The default `SYNC_BATCH_BLOCKS=5` targets about 10 seconds at a two second block time. Fetch logs from the Arkiv contract in windows of at most 1000 blocks.

By default (`syncLogs` in `apps/indexer/src/sync.ts`) no API key is used and no `arkiv_query` runs during sync. Events apply in block and log order: creations allowed by the creator or owner prefilter insert a pending log row, patches set `attrs_pending` and `updated_at` while keeping the old attributes, extensions update `expires_at`, transfers update `owner` (and mark the row pending under a filter expression), and deletions remove the row with a tombstone. Each changed key gets one change row at the batch end. The filler writes a fetched row only while the row is still pending and its `updated_at` is not newer than the block it queried; otherwise the key stays pending and is fetched again at a newer block. `createClients` in `main.ts` builds every RPC client, and only a keyed opt in gives a client the key; `apps/indexer/test/keyless.test.ts` asserts that no request carries `Authorization` or `X-API-Key` through bootstrap, ticks and fills.

With `SYNC_USE_API_KEY=true` or `BACKFILL_MODE=query` the keyed path (`syncBatch`) runs instead. Deduplicate touched keys and retain indexed keys plus relevant creations allowed by creator or owner terms. Without such terms, retain all touched keys. Query these in chunks of 50 at the batch end using the configured expression. Upsert returned entities and replace all their attributes. Remove keys absent from the response and record tombstones. Sweep `expires_at <= batchEnd` even when no events arrive. Commit the batch and checkpoint together, then atomically publish the latest delta.

Every `SNAPSHOT_INTERVAL_BLOCKS`, default 30, publish new versioned Parquet files containing live rows and atomically replace the manifest. Keep `KEEP_SNAPSHOTS`, default two, and prune older versions. Snapshot file paths must end in `.parquet` because DuckDB COPY without partitioning writes a file, not a directory.

The web proxy streams approved paths with Range and conditional request headers. It returns 502 while the indexer is unavailable and should recover on the next request after restart. Browser merge views combine snapshots, delta updates, and tombstones, then filter against a head read directly from RPC. Browser live tail is omitted to preserve query budget. Plan 03 supplies the live loop and HTTP server on port 8080 with `/health`.

## Deployment verification

Use the README setup and wait for the health check. Check `/data/manifest.json` through port 3000 and request `Range: bytes=0-99` for a manifest referenced Parquet file; expect 206. Restart the stack without deleting volumes and confirm checkpoint reuse. Stop and restart the indexer to check proxy recovery. Verify the API key is absent from the built `.next` files without printing the key. Check that the indexer log says `API key not used` unless a keyed mode was chosen deliberately. Default startup must leave the writer stopped. TLS belongs in the host proxy, outside Compose.
