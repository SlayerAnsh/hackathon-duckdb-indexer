# Plan 13: Progressive Newest First Backfill on the Public RPC

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `docs/plans/12-log-replay-backfill.md` and the current code: `apps/indexer/src/{replay,backfill,main,sync,snapshot,delta,store,config}.ts`, `packages/core/src/{rpc,views}.ts`
3. `apps/web/lib/views.ts`, `apps/web/components/dash/Hero.tsx` (or the hero stats component)

**Goal:** Publish a usable snapshot of every live entity immediately from log data, then fill attributes newest first using the anonymous public RPC budget, publishing progress as it goes, without spending the API quota by default.

**Decision (user, 18 October 2026):** stop spending the monthly quota on backfill; use the public RPC; the latest data must be available first.

**Current state on disk (`data/7738577-0x9548806311/index.duckdb`):** a stopped run left `replay_live`, `replay_target` and fetch progress tables from plan 12 (about 12,500 of about 30,700 live keys fetched, 250 chunks). Reuse them; do not delete fetched rows.

**Measured facts:** anonymous `arkiv_query` budget is `RateLimit: limit=10000` units per IP with `Retry-After` (about one hour window), at least 100 units per call; 429 body `{"error":"ANON_COST_LIMITED",...}`. Anonymous `eth_getLogs` is not metered by that budget. Keyed lookups with the API key used about 0.02% of the monthly quota per 50 key chunk.

## Review Focus

1. Restart in the middle of filling resumes with the next unfetched newest keys; nothing already fetched is fetched again.
2. 429 on the anonymous RPC pauses filling until `Retry-After` (logged once, not every tick) while live sync and snapshot publishing continue.
3. A pending entity that gets deleted, expires, or is patched before its fill is handled: deleted or expired keys are dropped from the queue; patched keys are fetched by the normal live sync path and removed from the queue.
4. The API key is never used for filling unless `FILL_USE_API_KEY=true`.
5. Pending rows never break the browser views: `attributes` simply has no rows for them, `entities` shows them with `attrs_pending = true`.

---

### Task 1: Log derived rows for every live key

**Files:** `apps/indexer/src/replay.ts`, `apps/indexer/src/store.ts`, tests in `apps/indexer/test/replay.test.ts`

- Replay captures, per key, from `EntityCreated`: owner (creator = owner at creation), created block, expiresAt, raw creation flags; from `OwnershipTransferred`: new owner; from `ExpiryExtended`: expiresAt; `updated_at` = block of the latest event for the key.
- If the persisted replay tables from plan 12 lack these columns, run a second free replay pass over the public RPC that only fills them (resumable, same windowing and `-32602` handling).
- `entities` gains column `attrs_pending BOOLEAN DEFAULT false`. Every live key without a fetched row is inserted from log data with `content_type NULL`, `attrs_pending true`.
- [ ] Tests first: lifecycle cases produce the right owner, creator, created_at, updated_at, expires_at, flags; transfer changes owner but not creator; existing fetched rows are not overwritten by log rows.

### Task 2: Newest first filler on the anonymous budget

**Files:** create `apps/indexer/src/fill.ts`; modify `main.ts`, `config.ts`; tests `apps/indexer/test/fill.test.ts`

**Interfaces:**
- Config: `FILL_RPC_URL` (default public RPC, no key), `FILL_USE_API_KEY` (default `false`), `FILL_CHUNK` (default 50), `FILL_INTERVAL_MS` (default 4000).
- `fillPending(rpc: ArkivRpc, store: Store, expression: string, opts): Promise<{ fetched: number; dropped: number; pausedUntil?: number }>` takes the 50 pending keys with the highest `updated_at` (then `created_at`), queries `keyChunkQueries(expression || null, keys)` at head with `ROW_SELECT`, upserts returned rows with `attrs_pending false` and a change row (so the delta carries them), drops keys not returned only when the log data says they are deleted or expired at head, otherwise leaves them pending for retry.
- Runs inside the existing tick loop as a separate guarded task; it never blocks live sync. On `RpcError` 429 it records `pausedUntil` from `Retry-After`.
- [ ] Tests first: newest first ordering; resume after restart; 429 pause; deleted key dropped; patched key fetched by sync is no longer pending; API key client is not used when `FILL_USE_API_KEY` is false.

### Task 3: Publish progressively

- Bootstrap in logs mode no longer blocks on fetching every key: after the replay (or reuse of persisted replay tables) it writes the log rows, writes a snapshot immediately, then starts the loop. Fills appear through the delta every tick and in the next snapshot.
- `/health` and `manifest.json` gain `pending: <count>` and `live: <count>`.
- [ ] Tests first: bootstrap with 3 pending keys publishes a snapshot containing them with `attrs_pending true`; after one fill the delta contains the filled rows.

### Task 4: Browser and core

- `packages/core/src/views.ts`: raw entity tables and views carry `attrs_pending` (default false when absent in older Parquet: use `COLUMNS`/`UNION BY NAME` or a `COALESCE`); tests updated.
- `apps/web`: the hero shows a small progress line when the manifest has `pending > 0` ("Loading attributes: 18,200 of 30,700 entities pending, newest first"); widgets grouping by attributes count pending entities as `pending` instead of `unlabelled`.
- [ ] `bun test` at the root and `bun run build` in `apps/web`: all pass.

### Task 5: Docs

- README and `SPECS.md` §7.4: progressive backfill, anonymous budget first, API key optional. `arkiv/friction.md`: keyed lookups cost about 0.02% of the monthly quota per 50 rows although `Arkiv-Cost` reads 100; the quota appears to scale with rows returned. `.env.example` and `docker-compose.yml` gain the `FILL_*` settings. No dashes as punctuation in docs.
- Write `CODEX-REPORT.md`.
