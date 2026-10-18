# Plan 14: Materialized Merge for Millisecond Queries

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `packages/core/src/views.ts` and `packages/core/test/views.test.ts`
3. `apps/web/lib/indexdb.ts` (serial queue, `transaction`, snapshot load, delta apply, `run` timing), `apps/web/lib/live-tail.ts` (writes `live_*` tables and reads `attributes`), `apps/web/lib/views.ts`, `apps/web/lib/heights.ts` (`OLDEST_SQL`)

**Goal:** Bring dashboard query times on the full index (about 31,000 live entities, about 17,000 pending) back to single digit milliseconds in DuckDB WASM. Measured now: stat tiles take 44 to 60 ms; on the small demo store they took 2.6 to 11 ms.

**Cause:** the public views `entities` and `attributes` recompute the merge of base, delta and live sources on every query: a `row_number()` window over all sources, and in `attribute_source` a correlated subquery per row.

**Approach:** compute the merge once per data change into plain tables, and point the public views at those tables. Expiry stays a cheap filter at query time because `live_head` moves every block.

## Review Focus

1. Every query result is identical to the current views for the same raw tables (base, delta, tombstones, live, live_pending, live_head), including pending rows, live tail pending attribute fallback, tombstones and expiry.
2. The materialized tables are refreshed inside the same serial section as every write to raw tables (snapshot load, delta apply, live tail apply, live tail clears). No user query may observe raw tables updated but merged tables stale.
3. A head change alone (`setHeadSql`) needs no refresh: expiry is applied by the views over the merged tables.
4. Widget SQL, `OLDEST_SQL` and console queries keep working unchanged (`entities`, `attributes` names and columns unchanged, including `attrs_pending`).
5. The refresh itself is fast enough to run on every delta and live tail block (report its time on 31,000 entities).

---

### Task 1: Core SQL

**Files:** `packages/core/src/views.ts`, `packages/core/test/views.test.ts`

**Interfaces:**
- Keep the existing merge logic as internal views (rename `entities` to `merged_entities_v`, `attributes` to `merged_attributes_v`, or similar), without the expiry filter in the attributes join (filter by expiry in the public view).
- `MATERIALIZE_SQL: string[]`: statements that rebuild tables `merged_entities` and `merged_attributes` from those views (`CREATE OR REPLACE TABLE ... AS SELECT ...`, or delete and insert; pick the faster in DuckDB and say which).
- `MERGE_VIEWS_SQL` keeps its name and now also creates the empty merged tables and the public views: `entities` = `SELECT * FROM merged_entities WHERE expires_at > (SELECT block FROM live_head)`; `attributes` = merged attributes joined to `entities` (only unexpired keys).
- [ ] Tests first: an equivalence test that seeds many scenarios (pending, tombstone in delta and live, live_pending fallback to base and delta attributes, expiry at head, fetched delta beating a pending base row) and asserts `entities` and `attributes` after `MATERIALIZE_SQL` equal the old view output. Keep all existing tests passing, adding `MATERIALIZE_SQL` after each raw table write in them.

### Task 2: Refresh in the browser

**Files:** `apps/web/lib/indexdb.ts`, `apps/web/lib/live-tail.ts`, tests in `apps/web/test/`

- Append `MATERIALIZE_SQL` to every transaction that writes raw tables (snapshot load, delta apply, live tail apply and clears). Do not refresh on head-only updates.
- `live-tail.ts` reads `attributes` to capture previous attributes; make sure it reads a consistent state (refresh before the read when it follows a raw write in the same section).
- [ ] Tests first: after a live tail apply and after a delta apply, `entities` reflects the new rows without any extra call; a head change hides an expired row without a refresh.

### Task 3: Benchmark

**Files:** create `apps/web/scripts/bench-views.ts` (Bun, node DuckDB), no test runner dependency

- Seeds 31,000 entities (17,000 pending), about 6 attributes per filled entity, 300 delta rows, 50 live rows, then runs every widget SQL in `VIEWS` plus `OLDEST_SQL` 20 times against (a) the old views and (b) the new materialized views, and prints median ms per widget plus the `MATERIALIZE_SQL` refresh time. Paste the output in the report.
- [ ] `bun test` at the root, `bunx tsc --noEmit -p packages/core`, `bunx tsc --noEmit -p apps/web` (known `bun:test` errors only), `bun run build` in `apps/web`: all pass.

### Task 4: Docs

- `SPECS.md` (browser merge section) and `DEVELOPER.md`: merged tables refreshed per data change, expiry applied at query time. `CHANGELOG.md` entry. No dashes as punctuation.
- Write `CODEX-REPORT.md`.
