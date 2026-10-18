# Plan 09: Paused Backend and Browser Live Tail

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `SPECS.md` §4 (RPC facts and budgets), §8
3. Current code: `apps/indexer/src/main.ts`, `apps/indexer/src/http.ts`, `packages/core/src/views.ts`, `packages/core/src/rpc.ts`, `apps/web/lib/indexdb.ts`, `apps/web/components/StatusBar.tsx`

**Goal:** (1) The indexer can serve its existing snapshot without making any RPC call (`SYNC_PAUSED=true`). (2) Freshness moves to the browser: it follows chain logs on the public RPC without an API key and applies changes to local `live_*` tables, spending the anonymous query budget only on attribute fetches.

**Decision (user, 18 October 2026):** the private API key is used only by the backend. The browser uses the public endpoint without a key. Backend sync is paused to save the monthly quota.

**Architecture:** Logs are free (`eth_getLogs` is not metered), `arkiv_query` is metered (anonymous budget about 10,000 units per IP per hour, 100 per call). Most changes are applied from log fields alone. Only creations and patches need attributes, fetched in throttled batches of 50 keys.

**Spec:** `SPECS.md`

## Review Focus

1. HTTP 429 `ANON_COST_LIMITED` in the browser: stop fetching attributes until `Retry-After`, keep applying log only changes, show the state in the status bar; never mark rows deleted because a fetch failed.
2. An entity created and deleted before its attributes are fetched: the tombstone wins, the pending fetch is dropped.
3. Live rows must outrank delta and base for the same key (newer `updated_at`), and a live tombstone hides base rows.
4. Paused indexer started with no store on disk: exits with a clear message instead of calling RPC.
5. Events for keys that do not match the manifest expression must not appear (use the same relevance prefilter as the server: indexed keys, or creations whose owner passes `ownerTerms(expression)`; when the expression has no owner terms every key is relevant).

---

### Task 1: Paused serving mode in the indexer

**Files:**
- Modify: `apps/indexer/src/config.ts`, `apps/indexer/src/main.ts`
- Test: `apps/indexer/test/paused.test.ts`

**Interfaces:**
- `Config.syncPaused: boolean` from env `SYNC_PAUSED` (`true` or `1`).
- `servePaused(config: Config, log?): Promise<{ dir: string }>` finds the active store directory under `dataDir` (reads `active-generation.json` when present, else the single `<chainId>-<hash>` directory with a `manifest.json`), and serves it with the existing handler. `TIRAMISU_API_KEY` is not required when paused.

- [ ] **Step 1: Write failing tests:** paused config does not require `TIRAMISU_API_KEY`; `servePaused` resolves the store written by `bootstrap` in a temp dir and the handler serves its manifest; a fake rpc passed nowhere is never called (paused path takes no rpc); missing store throws `No indexed store found in <dataDir>`.
- [ ] **Step 2:** Run `bun test apps/indexer/test/paused.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. `/health` reports `{ paused: true, headBlock, lastSnapshot }` from the manifest.
- [ ] **Step 4:** Run all indexer tests. Expected: PASS.

### Task 2: Live tables in the merge views

**Files:**
- Modify: `packages/core/src/views.ts`
- Test: `packages/core/test/views.test.ts`

**Interfaces:**
- `RAW_TABLES_SQL` adds `live_entities`, `live_attributes` (same columns as delta), `live_tombstones(key VARCHAR, block UBIGINT)`, and `live_pending(key VARCHAR)` (keys whose attributes are not fetched yet).
- `LIVE_TABLES = ['live_entities', 'live_attributes', 'live_tombstones', 'live_pending'] as const`.
- Winner rule becomes: a key's newest source by `updated_at` (tombstone `block` counts as its `updated_at`) among base, delta and live; ties go to the later source (live > delta > base).
- When the live winner key is in `live_pending`, `attributes` shows the previous source's attributes for that key (stale but present) instead of none.

- [ ] **Step 1: Write failing tests:** live upsert beats delta; live tombstone hides base and delta; delta newer than an old live row wins (snapshot rollover case); pending live key keeps base attributes; all existing view tests still pass.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run all core tests. Expected: PASS.

### Task 3: Browser live tail

**Files:**
- Create: `apps/web/lib/live-tail.ts`
- Modify: `apps/web/lib/indexdb.ts`, `apps/web/components/StatusBar.tsx`
- Test: `apps/web/test/live-tail.test.ts`

**Interfaces:**
- `type LiveChange = { kind: 'upsert'; entity: Partial<EntityRow> & { key: string; updated_at: number }; needsAttributes: boolean } | { kind: 'tombstone'; key: string; block: number }`
- `changesFromLogs(logs: RawLog[], known: (key: string) => EntityRow | undefined): LiveChange[]` (decode with `ENTITY_EVENTS_ABI`, in block and log order):
  - `EntityCreated`: upsert with `owner`, `creator = owner`, `created_at = updated_at = block`, `expires_at`, `creation_flags` from raw flags, `content_type null`, `needsAttributes true`.
  - `EntityPatched`: upsert `updated_at = block` (other fields from `known`), `needsAttributes true`.
  - `ExpiryExtended`: upsert `expires_at`, `updated_at = block`, `needsAttributes false`.
  - `OwnershipTransferred`: upsert `owner = newOwner`, `updated_at = block`, `needsAttributes false`.
  - `EntityDeleted`: tombstone.
  - Patch, extend or transfer for a key that `known` does not return and that was not created earlier in the same batch: skip (not in the index).
- `class LiveTail { constructor(opts: { rpcUrl: string; expression: string; apply: (sql: string[]) => Promise<void>; known: (key: string) => Promise<EntityRow | undefined>; onStatus: (s: LiveStatus) => void; now?: () => number }); start(fromBlock: number): void; stop(): void }`
- `type LiveStatus = { block: number; pending: number; budget: 'ok' | 'exhausted'; retryAt?: number }`
- Loop every 4 s: `eth_getLogs` from the last block + 1 to head (windows of 1,000 blocks), relevance prefilter (Review Focus 5), apply changes with SQL into `live_*` tables, add `needsAttributes` keys to `live_pending`.
- Attribute fetch: at most one `arkiv_query` per 20 s, `keyChunkQueries(expression, pending.slice(0, 50))`, select `ROW_SELECT`, no API key, at head. Returned rows upsert into `live_entities` and `live_attributes` and leave `live_pending`. Pending keys not returned are tombstoned (deleted, expired or left the filter). On `RpcError` status 429, set `budget: 'exhausted'` until `Retry-After` and skip fetches.
- `IndexDb` starts `LiveTail` from `delta.toBlock + 1` after the first delta load, clears `live_*` tables on snapshot version change, and passes status to the UI. `StatusBar` shows "live tail at block N, M attribute fetches pending" and the budget state.

- [ ] **Step 1: Write failing tests** with a fake fetch serving canned logs and query responses: each event kind maps as above; unknown key patch is skipped; create then delete in one batch gives only a tombstone; the throttle allows one query per 20 s with a fake clock; 429 sets `exhausted` and suppresses queries until `retryAt`; pending keys missing from a query result are tombstoned.
- [ ] **Step 2:** Run `bun test apps/web/test/live-tail.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Encode logs with viem `encodeEventTopics`/`encodeAbiParameters` in tests rather than hand writing topics.
- [ ] **Step 4:** Run all web tests and `bun run build` in `apps/web`. Expected: PASS and build success.

### Task 4: Docs

- [ ] **Step 1:** README and `SPECS.md` §8: freshness now comes from the browser live tail on the public endpoint; the indexer can run paused (`SYNC_PAUSED=true`); the API key never reaches the browser. Add `SYNC_PAUSED` to `.env.example` and the indexer environment in `docker-compose.yml` (default `false`). No dashes as punctuation in docs.
