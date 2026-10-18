# Changelog

## Unreleased

* Browser merges are materialized once per data change in the write transaction. Public views retain pending attribute fallback and apply expiry at query time, avoiding repeated source ranking for dashboard and console queries.

* Progressive backfill: every live entity is published from public log data at once, then attributes are filled newest first on the anonymous public RPC budget. The API key is optional for fills (`FILL_USE_API_KEY`).
* Keyless by default: live sync applies public operation logs directly (creations and patches mark rows `attrs_pending`, extensions, transfers and deletions update rows in place) and the filler fetches attributes on the anonymous budget. `TIRAMISU_API_KEY` is optional; only `SYNC_USE_API_KEY=true`, `FILL_USE_API_KEY=true` or `BACKFILL_MODE=query` send it, each fails fast without a key, and startup states which mode is used.
* A fill whose key changed after the queried block is discarded and retried, so a patch, transfer or extension during a fill is never overwritten by older data.
* `entities.attrs_pending`, plus `live` and `pending` counts in `manifest.json` and `/health`; the dashboard shows fill progress.

## 0.1.0 (2026 October 18)

Initial hackathon release, built during 9 to 18 October 2026.

* Selective Arkiv backfill into DuckDB with immutable Parquet snapshots.
* Batched live sync, JSON deltas, tombstones, and expiry filtering across storage and browser views.
* Next.js data proxy and browser DuckDB WASM SQL dashboard with payload and verify actions.
* Synthetic support desk writer covering batch creation, patches, extension, and ownership transfer.
* Docker Compose deployment with persistent index data and optional demo profile.
* MIT licence, reproducible setup, demo schema, and provider friction reports.

Public deployment and demo video remain submission follow ups.
