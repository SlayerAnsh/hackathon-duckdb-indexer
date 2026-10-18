# Plan 03: Indexer Live Sync, Delta and HTTP

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `SPECS.md` §4 (relevance prefilter), §7.5, §7.7, §7.9
3. Plan 02 output: `apps/indexer/src/store.ts`, `snapshot.ts`, `main.ts`

**Goal:** Keep the store current in batches from `eth_getLogs`, write `delta.json` after each batch, snapshot periodically, sweep expiry, and serve files over HTTP.

**Architecture:** `syncBatch` is a pure function of (rpc, store, range) so it is tested with fakes. A loop in `main.ts` schedules batches, snapshots and sweeps. `http.ts` wraps `Bun.serve` behind a `handle(req: Request): Promise<Response>` that tests call directly.

**Tech Stack:** Bun, `@duckdb/node-api`, `@asi/core`, SDK `decodeEventLog` with `ENTITY_EVENTS_ABI` from `@arkiv-network/sdk`.

**Spec:** `SPECS.md`

## Review Focus

1. Entity created and deleted inside one batch: query returns nothing; it must not be tombstoned if never indexed, and must not crash.
2. Batch with zero relevant keys makes zero `query` calls but still advances `head_block`.
3. `Range: bytes=0-99` on a Parquet file returns 206 with `Content-Range: bytes 0-99/<size>` and exactly 100 bytes.
4. `If-None-Match` equal to the current ETag on `delta.json` returns 304 with no body.
5. Path traversal (`/snap/../index.duckdb`, encoded `%2e%2e`) returns 404.

---

### Task 1: Batch sync

**Files:**
- Create: `apps/indexer/src/sync.ts`
- Test: `apps/indexer/test/sync.test.ts`

**Interfaces:**
- Consumes: `ArkivRpc.getLogs`, `keyChunkQueries`, `ownerTerms`, `decodeEntity`, `ROW_SELECT`, `Store`.
- Produces:
  - `touchedFromLogs(logs: RawLog[]): { keys: string[]; createdBy: Map<string, string> }` (key = topic 1 lowercased; for `EntityCreated` logs, owner = last 20 bytes of topic 2; detect the event by topic 0 using `ENTITY_EVENTS_ABI`)
  - `syncBatch(rpc: ArkivRpc, store: Store, expression: string, from: number, to: number): Promise<{ queried: number; upserted: number; removed: number }>`

- [ ] **Step 1: Write failing tests** with fake rpc and a real temp store:
  - `touchedFromLogs` on two logs with mixed case topics returns lowercased unique keys; created owner from topic `0x0000000000000000000000006cb41094b6ae370454c2c34cf91cf02e768a5e22` is `0x6cb41094b6ae370454c2c34cf91cf02e768a5e22`.
  - `queries indexed key`: store holds key A; logs touch A and unrelated B (created by another owner, expression `$creator = addr(0x11..)`); exactly one `query` call whose text contains A and not B, with `atBlock = to`.
  - `new matching creation is queried`: B created by the expression's creator is included.
  - `no owner terms queries all touched keys`.
  - `missing indexed key is removed`: A indexed, query returns nothing, A removed with `changes(to, A, true)`.
  - `new key not returned is ignored`: no tombstone for a key that was never indexed.
  - `120 relevant keys make 3 calls`.
  - `getLogs windows`: range of 2,500 blocks calls `getLogs` 3 times (1,000 block windows).
  - `getLogs capacity error splits`: fake throws `RpcError` code `-32602` with message containing `max results` for a 1,000 block window; the window is halved and retried until it succeeds; any other error propagates.
  - `block unavailable keeps checkpoint`: `query` throws `RpcError` code `-32006`; `syncBatch` rejects and `head_block` is unchanged (no head substitution).
  - `sweeps expired at checkpoint`: an indexed row with `expires_at <= to` and no logs is removed in the same batch, with `changes(to, key, true)`.
  - `head_block advances to 'to'` even when nothing is relevant.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Whole batch in one `store.transaction`, including the expiry sweep at `to` (expiry emits no event, SPECS §7.5). Record `to` and its block hash (`eth_getBlockByNumber`) in `sync_state.head_hash` (add the column).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(indexer): batched live sync`.

### Task 2: Delta file

**Files:**
- Create: `apps/indexer/src/delta.ts`
- Test: `apps/indexer/test/delta.test.ts`

**Interfaces:**
- Produces: `writeDelta(store: Store, dir: string): Promise<Delta>` (reads `changes` above `snapshot_block`; for each key, latest change wins; a live key emits its current entity and attributes, a removed key emits a tombstone with its change block; `fromBlock = snapshot_block + 1`, `toBlock = head_block`; written via temp file and rename)

- [ ] **Step 1: Write failing tests:** `upsert then delta has entity and attributes`; `remove after upsert gives tombstone only`; `remove then re-create gives entity only`; `empty changes gives empty arrays with correct block range`; `numbers are numbers in JSON, not strings`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(indexer): delta file`.

### Task 3: HTTP handler

**Files:**
- Create: `apps/indexer/src/http.ts`
- Test: `apps/indexer/test/http.test.ts`

**Interfaces:**
- Produces: `createHandler(dir: string, health: () => object): (req: Request) => Promise<Response>`; `serve(port: number, handler): { stop(): void }` (only place that touches `Bun.serve`)

- [ ] **Step 1: Write failing tests** calling the handler directly:
  - `/manifest.json` 200, `cache-control: no-cache`, `etag` present.
  - `/delta.json` with matching `if-none-match` gives 304.
  - `/snap/v1/entities.parquet` 200 with `cache-control: public, max-age=300, immutable` and `accept-ranges: bytes`.
  - Range request gives 206, correct `content-range`, `content-length` and bytes.
  - `/health` 200 JSON.
  - `/index.duckdb`, `/snap/../index.duckdb`, `/snap/%2e%2e/index.duckdb` give 404.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Allowed paths: `/manifest.json`, `/delta.json`, `/health`, `/snap/v<digits>/(entities|attributes).parquet`. ETag from file size and mtime.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(indexer): http server`.

### Task 4: Run loop

**Files:**
- Modify: `apps/indexer/src/main.ts`
- Test: `apps/indexer/test/loop.test.ts`

**Interfaces:**
- Also: before each batch, re-fetch the header of `head_block` and compare with `head_hash`. On mismatch (reorg or chain reset), log it, then build a fresh generation: backfill into a new store directory with a `-g<n>` suffix, snapshot it, and switch serving to it. A timeout is not a mismatch.
- Produces: `tick(ctx: { rpc: ArkivRpc; store: Store; dir: string; config: Config; meta: {...} }): Promise<void>` which: reads chain head; runs `syncBatch(head_block + 1, head - confirmations)` when that range is at least `syncBatchBlocks` long; writes delta; every `snapshotIntervalBlocks` since `snapshot_block` runs `writeSnapshot` then `writeDelta`.

- [ ] **Step 1: Write failing tests:** `tick below batch size does nothing`; `tick runs sync and writes delta`; `tick after interval snapshots and resets delta`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `import.meta.main` block: bootstrap, start `serve`, then `setInterval(tick, 2000)` with a guard against overlapping ticks; log errors and keep running (an `RpcError` with status 429 logs `Retry-After` and skips the tick).
- [ ] **Step 4:** Run all indexer tests. Expected: PASS.
- [ ] **Step 5:** **[Claude]** run against Tiramisu for 2 minutes, `curl` `/manifest.json`, `/delta.json`, a Range request; check the cost log. Commit `feat(indexer): run loop`.
