# Changelog

## Unreleased

* `docker-compose.dokploy.yml` stores the index in the named volume `index-data`, so Dokploy redeploys keep it. The indexer serves `/health` (with `bootstrapping: true`) while the first backfill runs, so the container stays healthy. A failed rollback no longer hides the original transaction error.
* Multi page web app: home page with story sections and live stats, `/showcase` chart gallery (each card one SQL query naming the clause `arkiv_query` cannot express), `/playground` SQL editor with snippets, history, CSV export, Payload and Verify, and an `/about` page with architecture and expiry figures.
* The web proxy serves stored index files from a read only mount of the data directory while the indexer is unavailable. Compose uses a bind mount at `INDEX_DATA_PATH` (default `./data`) instead of a named volume, and the base compose file publishes no host ports (`docker-compose.local.yml` publishes port 3000).
* Browser merges are materialized once per data change in the write transaction. Public views keep the pending attribute fallback and apply expiry at query time, avoiding repeated source ranking for showcase and playground queries.
* Progressive backfill: every live entity is published from public log data at once, then attributes are filled newest first on the anonymous public RPC budget. The API key is optional for fills (`FILL_USE_API_KEY`).
* Keyless by default: live sync applies public operation logs directly (creations and patches mark rows `attrs_pending`, extensions, transfers and deletions update rows in place) and the filler fetches attributes on the anonymous budget. `TIRAMISU_API_KEY` is optional; only `SYNC_USE_API_KEY=true`, `FILL_USE_API_KEY=true` or `BACKFILL_MODE=query` send it, each fails fast without a key, and startup states which mode is used.
* A fill whose key changed after the queried block is discarded and retried, so a patch, transfer or extension during a fill is never overwritten by older data.
* `entities.attrs_pending`, plus `live` and `pending` counts in `manifest.json` and `/health`; the UI shows fill progress.
* Submission docs: README pitch, architecture, local and Compose setup, judge reproduction steps; `arkiv/schema.md` lists every RPC request with its exact arguments; `arkiv/friction.md` covers each Arkiv surface used.

## 0.1.0 (2026 October 18)

Initial hackathon release, built during 9 to 18 October 2026.

* Selective Arkiv backfill into DuckDB with immutable Parquet snapshots.
* Batched live sync, JSON deltas, tombstones, and expiry filtering across storage and browser views.
* Next.js data proxy and browser DuckDB WASM SQL dashboard with payload and verify actions.
* Synthetic support desk writer covering batch creation, patches, extension, and ownership transfer.
* Docker Compose deployment with persistent index data and optional demo profile.
* MIT licence, reproducible setup, demo schema, and provider friction reports.

Public deployment and demo video remain submission follow ups.
