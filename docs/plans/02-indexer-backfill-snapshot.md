# Plan 02: Indexer Store, Backfill and Snapshot

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `SPECS.md` §7.1 to §7.4, §7.6, §7.8
3. `packages/core/src/index.ts` (plan 01 output)

**Goal:** `apps/indexer` opens a store keyed by chain identity, backfills all entities matching the expression, and writes versioned Parquet snapshots plus `manifest.json`.

**Architecture:** One `Store` class owns the DuckDB connection (only writer). Backfill takes an `ArkivRpc`, so tests pass a fake. Snapshot writes Parquet with `COPY`, then renames a temp manifest into place.

**Tech Stack:** Bun, `@duckdb/node-api` 1.5.x, `@asi/core`, `bun test`.

**Spec:** `SPECS.md`

## Review Focus

1. Restart after a completed backfill must not backfill again (resume from `sync_state.head_block`).
2. Configured expression differs from stored expression: startup throws with a message naming both and the store path.
3. Rows with `expires_at <= head` must not appear in any snapshot file.
4. A crash between Parquet writes and manifest rename must leave the previous manifest valid (manifest written last, via rename).
5. Missing `TIRAMISU_API_KEY` or `INDEX_EXPRESSION` exits with a clear message, not a stack trace.

---

### Task 1: Config and store

**Files:**
- Create: `apps/indexer/package.json` (name `@asi/indexer`, deps `@asi/core` workspace, `@duckdb/node-api`), `apps/indexer/src/config.ts`, `apps/indexer/src/store.ts`
- Test: `apps/indexer/test/store.test.ts`

**Interfaces:**
- Produces:
  - `type Config = { rpcUrl: string; apiKey: string; expression: string; confirmations: number; syncBatchBlocks: number; snapshotIntervalBlocks: number; keepSnapshots: number; dataDir: string; port: number }`
  - `loadConfig(env: Record<string, string | undefined>): Config` (defaults from SPECS §7.1; rpcUrl default `https://rpc.tiramisu.db-chain.testnet.arkiv.network`)
  - `storeDir(dataDir: string, chainId: number, genesisHash: string): string` gives `<dataDir>/<chainId>-<genesisHash.slice(0, 12)>` (`0x` plus 10 hex chars)
  - `class Store { static open(dir: string, expression: string, chainId: number, genesisHash: string): Promise<Store>; state(): Promise<SyncState | null>; setState(s: Partial<SyncState>): Promise<void>; upsert(rows: { entity: EntityRow; attributes: AttributeRow[] }[], changeBlock: number | null): Promise<void>; remove(keys: string[], changeBlock: number): Promise<void>; indexedKeys(): Promise<Set<string>>; sweepExpired(head: number): Promise<number>; transaction<T>(fn: () => Promise<T>): Promise<T>; conn: DuckDBConnection; close(): void }`
  - `type SyncState = { chain_id: number; genesis_hash: string; expression: string; start_block: number; head_block: number; snapshot_version: number; snapshot_block: number }`

- [ ] **Step 1: Write failing tests** (temp dir per test):
  - `loadConfig throws on missing INDEX_EXPRESSION` with message containing `INDEX_EXPRESSION`.
  - `storeDir` for chain `7738577`, hash `0x95488063112df36be71b4700200a1b18e2578317853f9d82af5c3da313a5ab71` ends with `7738577-0x95488063`.
  - `upsert then reading entities returns row`; second upsert of same key with higher `updated_at` replaces it and replaces attributes (an attribute absent in the new version is gone).
  - `upsert with changeBlock writes changes rows`; `remove` deletes entity and attributes and writes `changes(block, key, true)`.
  - `sweepExpired(100)` deletes rows with `expires_at <= 100`, keeps `101`, returns count.
  - `open with different expression throws` mentioning both expressions.
- [ ] **Step 2:** `bun test apps/indexer/test/store.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with the schema in SPECS §7.3 (drop `payload_size`). Store `UBIGINT` blocks, convert with `Number()` on read.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(indexer): config and duckdb store`.

### Task 2: Backfill

**Files:**
- Create: `apps/indexer/src/backfill.ts`
- Test: `apps/indexer/test/backfill.test.ts`

**Interfaces:**
- Consumes: `ArkivRpc`, `decodeEntity`, `ROW_SELECT` from `@asi/core`; `Store`.
- Produces: `backfill(rpc: ArkivRpc, store: Store, expression: string, atBlock: number, log?: (msg: string) => void): Promise<number>` (returns rows written)

- [ ] **Step 1: Write failing tests** with a fake `ArkivRpc` serving pages:
  - `pages until no cursor`: three pages (200, 200, 7 rows) give 407 rows in the store and three `query` calls, each with `atBlock` equal to the argument and `limit 200`, second and third passing the previous cursor.
  - `upsert writes no changes rows` (backfill passes `changeBlock null`).
  - `rpc error propagates` and nothing from the failed page is written.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. One transaction per page.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(indexer): backfill`.

### Task 3: Snapshot and manifest

**Files:**
- Create: `apps/indexer/src/snapshot.ts`
- Test: `apps/indexer/test/snapshot.test.ts`

**Interfaces:**
- Produces: `writeSnapshot(store: Store, dir: string, head: number, meta: { chainId: number; genesisHash: string; expression: string }, keep: number): Promise<Manifest>`; `readManifest(dir: string): Promise<Manifest | null>`

- [ ] **Step 1: Write failing tests:**
  - `writes versioned parquet`: after one call, files `snap/v1/entities.parquet` and `snap/v1/attributes.parquet` exist; reading them with DuckDB gives only live rows (`expires_at > head`); attributes only for those keys.
  - `manifest fields`: `version 1`, `snapshotBlock = head`, `headBlock = head`, `files.entities = 'snap/v1/entities.parquet'`, `delta = 'delta.json'`.
  - `increments version and prunes`: four calls with `keep 2` leave only `snap/v3` and `snap/v4`.
  - `truncates changes`: rows in `changes` with `block <= head` are removed; `sync_state.snapshot_version` and `snapshot_block` updated.
  - `manifest written by rename`: no `manifest.json.tmp` left behind.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `COPY (...) TO '<abs path>.parquet' (FORMAT parquet)`; write `manifest.json.tmp` then `fs.rename`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(indexer): parquet snapshots and manifest`.

### Task 4: Startup entry

**Files:**
- Create: `apps/indexer/src/main.ts`
- Test: `apps/indexer/test/main.test.ts`

**Interfaces:**
- Produces: `bootstrap(config: Config, rpc: ArkivRpc, log?: (msg: string) => void): Promise<{ store: Store; dir: string; head: number }>` that resolves chain identity, opens the store, warns when `!hasCreatorTerm(expression)` (message contains `$creator`), backfills only when `state()` is null at `blockNumber() - confirmations`, sets `start_block` and `head_block`, and writes snapshot v1.

- [ ] **Step 1: Write failing tests:** `first run backfills and writes v1`; `second run with same dir does not call query`; `warns without $creator`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `main.ts` also has an `if (import.meta.main)` block that builds `createRpc(config.rpcUrl, { apiKey, onCost })`, logs cost and quota percent, and calls `bootstrap` (live sync and HTTP are added by plan 03).
- [ ] **Step 4:** Run all indexer tests. Expected: PASS.
- [ ] **Step 5:** **[Claude]** smoke test against Tiramisu with `INDEX_EXPRESSION='$creator = addr(0x679b5ab1cd4b488d73025d0d72d4017fa2d97b59)'`; check row count and the logged cost. Commit `feat(indexer): bootstrap`.
