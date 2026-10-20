# Changelog

## Unreleased

* Data contract versioning: `manifest.json` carries `schemaVersion` (`SCHEMA_VERSION = 1` in `packages/core`), bumped only on a breaking change. The web app refuses a newer version (`schemaCheck`) and reads a manifest without the field as version 1. README "Data API" and `arkiv/schema.md` state the compatibility rule.

* `examples/`: `top-creators.sh` (DuckDB CLI) and `top_creators.py` (duckdb package) read the hosted indexer directly and compute the top creators; `verify_against_chain.py` applies the Verify rule to indexed rows against the public RPC. README records their output of 20 October 2026, including a paused store caught as 45 `deleted` and 5 `extended` rows.

* Accuracy: the anonymous query rate is stated as an estimate from the measured `Arkiv-Cost: 100`; the Featured chip address is described as the author address; Featured renewal is described as checked every 6 hours and due when under 30 days remain (none has fallen due yet); `arkiv/schema.md` documents the 5 leftover `ticket` entities; the subgraph comparison names expiry, redeploys and the hosting trust point. README "On chain evidence" lists the lifecycle actions still to be exercised on chain as TODO rows.

* Friction report: tested `watchEntityEvents` over the Tiramisu WebSocket (complete while connected, a gap of 2 to 3 logs across a forced reconnect), measured the anonymous `Arkiv-Cost`, and recorded that the public RPC answers HTTP 403 to the default Python user agent. A fixture test (`apps/web/test/forged-featured.test.ts`) proves a dashboard forged by another wallet with every Featured attribute is never listed.

* Dashboard covers: an owner stars one widget in Organize, stored as the `cover` key attribute, and dashboard cards show its live chart with an automatic fallback when the cover is unavailable. `seed-official.ts --set-covers` (with optional `--dry-run`) applies the configured covers to existing Featured dashboards; keepalive keeps them in step.

* Submission docs: README and /about name the harmed users per pillar, explain why Arkiv and what stays off it, list how each Arkiv feature is used and why, and give an on chain evidence table for the real app wallet `0x1f61c3cac1612c020f64739b128c5f198939c8cd` (the previously cited address had no entities). `arkiv/schema.md` adds expiry per entity type, the reasons for each feature choice, the Featured `officialExpr` query and the app's DuckDB queries. `arkiv/friction.md` adds five entries for 19 and 20 October (create and transfer in one batch, wallet transport retries, extend at the cap, the anonymous budget on 20 October, the keyless fill backlog) and corrects the viem version to 2.57.7. Dates now state the extended deadline of 20 October 2026.

* Project restructure. The repository now ships two parts: an open source, self hostable indexer (`apps/indexer`, MIT, Docker Compose or Bun, all entities or an `INDEX_EXPRESSION` subset, Parquet snapshots, delta and manifest over HTTP) and a web app (`apps/web`) that runs against the hosted indexer at https://arkiv-sql-indexer.dokploy.anshudhar.dev covering all Arkiv data on Tiramisu. The app offers a SQL Playground, widgets saved as Arkiv entities, public dashboards with Featured dashboards kept live by the app wallet, Privy login, the keyed `/api/rpc` read proxy and the `/data` proxy to `INDEXER_URL`. README, SPECS, DEVELOPER, `arkiv/schema.md`, `.env.example` and page metadata describe this structure, with quick starts for self hosting the indexer and for running the app against the hosted indexer.

* App owned dashboards are called Featured instead of Official in user facing copy.

* Browser reads go through a same origin read proxy at `POST /api/rpc` that adds the server side `TIRAMISU_API_KEY` when set. It allows only read methods, caps body size and batch length, rate limits per client IP and times out after 15 seconds. Wallet signing and writes keep the public RPC. The key may now reach the web server runtime, never a public variable, build argument or the browser.

* Header shows Log in; signed in users get an account popover with balance, copy address, explorer link and quick links. Explore toolbars use two aligned rows, and empty lists show designed empty states with skeletons while loading.

* Owners delete and transfer their widgets by signing in the browser; low balance warnings below 0.1 GLM.

* Widgets belong to the user's wallet: created readonly and transferred in one batch, edits save a new version, Extend is signed by the viewer.

* Browser signing with the Privy wallet on Tiramisu, wallet error copy and balance checks.

* Official items require app ownership; my widgets and the Mine filter follow the Arkiv owner.

* Widget page and remaining pages restyled; official widgets show Kept live instead of Extend.

* Dashboards read like reports: numbered figures, quiet icon actions, share menu with Copy link and Post on X.

* Landing shows Official dashboards; the showcase page is removed and redirects to Explore.

* Explore page with Dashboards and Widgets tabs; /widgets redirects to the Widgets tab.

* Seed script and in process keepalive for official dashboards.

* Official dashboards: entities whose user is the app wallet, defined from the former showcase queries.

* Stacked bar and histogram widgets; time range pickers removed.

* Console theme with dark and light modes, calm navigation and the index status bar on every page.

* Removed the demo writer; the dashboard wallet is the only writer and widgets, dashboards and links are the live application data.

* Public SQL widgets and shareable dashboards stored on Arkiv, with Privy social login, chart configuration, expiry and extension, dashboard organization and imports, a widget explorer and personal activity home; backend paid writes, scoped reads and documented self hosting setup.

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
