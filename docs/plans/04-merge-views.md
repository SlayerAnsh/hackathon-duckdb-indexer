# Plan 04: Merge Views

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `SPECS.md` §8, §13

**Goal:** SQL that merges snapshot tables and delta tables into the public `entities` and `attributes` views, hiding rows at or past the live head. The same SQL runs in DuckDB WASM (browser) and `@duckdb/node-api` (tests).

**Architecture:** SQL strings exported from `packages/core/src/views.ts`. No `getvariable`: the head lives in a one row table `live_head(block UBIGINT)` so the SQL works on any DuckDB build. Sources are `base_*` (snapshot) and `delta_*`. The browser live tail is out of scope (query budget, SPECS §4).

**Tech Stack:** SQL (DuckDB dialect), `@duckdb/node-api` for tests only (dev dependency of `@asi/core`).

**Spec:** `SPECS.md`

## Review Focus

1. Key present in base and tombstoned in delta: hidden from both views.
2. Key tombstoned in delta then re-created later in the same delta: `writeDelta` emits only the entity, so the view shows the new version.
3. Patch that removes an attribute: `attributes` view must not show the removed attribute from base.
4. Extend that moves expiry past head: the row is visible again even if base had it expiring.
5. `live_head` empty (before first head fetch): views return zero rows rather than everything.

---

### Task 1: Tables and views

**Files:**
- Create: `packages/core/src/views.ts`
- Test: `packages/core/test/views.test.ts`

**Interfaces:**
- Produces:
  - `RAW_TABLES_SQL: string[]` creating `base_entities`, `base_attributes`, `delta_entities`, `delta_attributes` (columns as `EntityRow`/`AttributeRow`, blocks `UBIGINT`, `num DOUBLE`), `delta_tombstones(key VARCHAR, block UBIGINT)`, `live_head(block UBIGINT)`; all `CREATE TABLE IF NOT EXISTS`
  - `MERGE_VIEWS_SQL: string[]` creating views `entities` (EntityRow columns) and `attributes` (AttributeRow columns), `CREATE OR REPLACE VIEW`
  - `setHeadSql(block: number): string[]` (delete then insert into `live_head`)
  - `loadSnapshotSql(entitiesUrl: string, attributesUrl: string): string[]` (replace base tables from `read_parquet(url)`, escaping single quotes)
  - `DELTA_TABLES = ['delta_entities', 'delta_attributes', 'delta_tombstones'] as const`

- [ ] **Step 1: Write failing tests.** Helper inserts rows into raw tables with plain `INSERT`. Head is 100 unless stated. Cases:
  - `base only`: A in base (`expires_at 200`) shows in `entities` with its attributes.
  - `expired hidden`: base A `expires_at 100` with head 100 is hidden; head 99 shows it.
  - `delta upsert wins`: base A `updated_at 10` attr `status='open'`; delta A `updated_at 20` attr `status='closed'` gives one row with `updated_at 20` and attribute `closed` only.
  - `patch removes attribute`: base A has `x` and `y`, delta A has only `x`, so `attributes` for A is only `x`.
  - `tombstone hides`: base A, tombstone A block 30 gives no row in either view.
  - `extend revives`: base A `expires_at 90`, delta A `expires_at 300` with head 100 shows A.
  - `delta new key`: key only in delta shows.
  - `empty head hides all`.
  - `loadSnapshotSql round trip`: write a Parquet file with node DuckDB, load via `loadSnapshotSql`, view shows rows.
- [ ] **Step 2:** `bun test packages/core/test/views.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Approach: a `winner` view picks per key the delta source when the key appears in `delta_entities` or `delta_tombstones`, else base (delta is always newer than the snapshot by construction, so no `updated_at` comparison is needed). `entities` joins winner rows that are not tombstoned with `expires_at > (SELECT block FROM live_head)`. `attributes` takes attributes from the winning source only, joined to `entities`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(core): merge views`.
