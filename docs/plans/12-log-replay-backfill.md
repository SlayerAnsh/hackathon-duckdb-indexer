# Plan 12: Index Every Entity via Public Log Replay

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `SPECS.md` §4, §7
3. Current code: `apps/indexer/src/{config,main,backfill,sync,store,snapshot}.ts`, `packages/core/src/{rpc,query}.ts`

**Goal:** Index all live Arkiv entities (no filter) without broad `arkiv_query` scans, which burn the monthly quota. Discover live keys by replaying native operation logs on the public RPC (no API key, not metered), then fetch rows by key with the private key (cheap).

**Decision (user, 18 October 2026):** index every entity; logs come from the public RPC; the private API key is used only by the backend for key lookups; backend sync resumes.

**Measured facts (18 October 2026, Tiramisu):**
- Public `eth_getLogs` without a key works from block 0; header `RateLimit: limit=600, remaining=..., reset=29`; no `Arkiv-Cost`.
- Above 20,000 results it fails with `{"code":-32602,"message":"query exceeds max results 20000, retry with the range 725725-731557"}`.
- About 2 to 3 logs per block, about 745,000 blocks, about 30,700 live entities.
- Keyed `arkiv_query` (50 `$key` terms, full select) left the quota percent unchanged over 10 calls; broad scans (`$expiresAt > u64(0)`) used about 0.7% per 200 row page.

## Review Focus

1. Entity created, extended, then expired with no event: not live at `B0` (latest `expires_at <= B0`).
2. Entity created then deleted: not live. Entity deleted then a new entity with another key: unaffected.
3. `-32602 ... retry with the range a-b`: retry exactly that range first, then continue from `b + 1`; if the message has no range, halve the window. HTTP 429 waits for `Retry-After` and retries; other errors fail the run without advancing the checkpoint.
4. Restart in the middle of a replay resumes from the last committed window, not block 0, and never double counts (dedupe by `(block, logIndex)`).
5. Empty `INDEX_EXPRESSION` means every entity: queries use `keyChunkQueries(null, keys)`, the relevance prefilter treats every key as relevant, and startup warns that no `$creator` filter is set.

---

### Task 1: Config and two RPC clients

**Files:**
- Modify: `apps/indexer/src/config.ts`, `apps/indexer/src/main.ts`
- Test: `apps/indexer/test/store.test.ts` (config cases) or a new `apps/indexer/test/config.test.ts`

**Interfaces:**
- `Config.publicRpcUrl: string` from `PUBLIC_RPC_URL`, default `https://rpc.tiramisu.db-chain.testnet.arkiv.network`.
- `Config.expression: string` may be empty (`INDEX_EXPRESSION` unset or blank means all entities). Store identity compares the normalised expression (empty string for all).
- `Config.backfillMode: 'logs' | 'query'` from `BACKFILL_MODE`, default `logs`.
- `main` builds `logsRpc = createRpc(publicRpcUrl)` (no key) for `getLogs`, `blockNumber`, `blockHash`, `chainId`, `genesisHash`, and `queryRpc = createRpc(rpcUrl, { apiKey })` for `query` only.

- [ ] **Step 1: Write failing tests:** blank expression accepted; `PUBLIC_RPC_URL` default; `BACKFILL_MODE` default `logs`; invalid mode rejected.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `syncBatch` takes logs from `logsRpc` and queries from `queryRpc` (add a parameter or a `{ logs, query }` pair; keep existing tests passing).
- [ ] **Step 4:** Run all indexer tests. Expected: PASS.

### Task 2: Log replay

**Files:**
- Create: `apps/indexer/src/replay.ts`
- Test: `apps/indexer/test/replay.test.ts`

**Interfaces:**
- `fetchLogsAdaptive(rpc: ArkivRpc, from: number, to: number, onWindow: (logs: RawLog[], from: number, to: number) => Promise<void>, opts?: { window?: number; sleep?: (ms: number) => Promise<void> }): Promise<void>` (default window 20,000 blocks; handles Review Focus 3)
- `replayLiveKeys(rpc: ArkivRpc, store: Store, toBlock: number, log?): Promise<string[]>`:
  - Table `replay_events(key VARCHAR, kind VARCHAR, block UBIGINT, log_index INTEGER, expires_at UBIGINT, PRIMARY KEY (block, log_index))` and `replay_state(next_block UBIGINT)`; each window inserts its decoded events and advances `next_block` in one transaction (Review Focus 4).
  - Decode with `ENTITY_EVENTS_ABI` (via the core re export); keep `EntityCreated` (expiresAt), `ExpiryExtended` (expiresAt), `EntityDeleted`; others only need the key.
  - Live keys: keys whose latest event is not `EntityDeleted`, that have an `EntityCreated`, and whose latest known `expires_at > toBlock`. Computed in SQL.
  - Drops the replay tables after success.

- [ ] **Step 1: Write failing tests** with a fake rpc: the five lifecycle cases above give the expected live set; `-32602` with a suggested range retries that range; `-32602` without a range halves; 429 waits (fake sleep) then succeeds; crash after window 2 of 4 then rerun resumes at window 3 with no duplicates.
- [ ] **Step 2:** `bun test apps/indexer/test/replay.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Encode test logs with viem `encodeEventTopics` and `encodeAbiParameters` from the SDK ABI.
- [ ] **Step 4:** Run. Expected: PASS.

### Task 3: Backfill by key

**Files:**
- Modify: `apps/indexer/src/backfill.ts`, `apps/indexer/src/main.ts`
- Test: `apps/indexer/test/backfill.test.ts`

**Interfaces:**
- `backfillByKeys(rpc: ArkivRpc, store: Store, expression: string, keys: string[], atBlock: number, log?): Promise<number>` runs `keyChunkQueries(expression || null, keys)` at `atBlock` with `ROW_SELECT`, upserting returned rows (no change rows), one transaction per chunk, logging progress every 50 chunks.
- `bootstrap` with `backfillMode 'logs'`: `B0 = head - confirmations`; `replayLiveKeys(logsRpc, store, B0)`; `backfillByKeys(queryRpc, ...)`; then the existing snapshot path. `'query'` keeps the current backfill.

- [ ] **Step 1: Write failing tests:** 120 keys make 3 queries pinned at `atBlock`; empty expression sends only the key OR; keys not returned are not inserted; bootstrap in logs mode never calls `query` with a non key expression (assert every query text contains `$key = key(`).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run all indexer tests. Expected: PASS.

### Task 4: Config files and docs

- [ ] **Step 1:** `docker-compose.yml` indexer environment adds `PUBLIC_RPC_URL`, `BACKFILL_MODE` (default `logs`), and makes `INDEX_EXPRESSION` optional (`${INDEX_EXPRESSION:-}`); `.env.example` documents both and that blank means every entity. Update `test/deployment.test.ts` accordingly.
- [ ] **Step 2:** README and `SPECS.md` §7.4: backfill replays public logs then fetches rows by key; the API key is used only for key lookups. `arkiv/friction.md`: add the measured quota behaviour (flat `Arkiv-Cost: 100` header while broad scans consume about 0.7% of the monthly quota per page and keyed lookups do not move it; anonymous `eth_getLogs` limit 600 per window; the helpful `-32602` retry range). No dashes as punctuation.
- [ ] **Step 3:** `bun test` at the root. Expected: all pass.
- [ ] **Step 4:** Write `CODEX-REPORT.md`. Claude runs the live backfill.
