# Plan 11: Serve Stored Data Without the Indexer, Show Every Height

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `apps/web/lib/proxy.ts`, `apps/web/app/data/[...path]/route.ts`, `apps/indexer/src/http.ts` (allow list, Range and ETag behaviour to mirror), `docker-compose.yml`
3. Plans 09 and 10 output (live tail status, new TopBar)

**Goal:** (1) When the indexer process is down or paused, the web app still serves the stored Parquet snapshot, manifest and delta straight from the shared data directory. (2) The top bar shows each height and the lag between them, so a stale index is visible instead of hidden.

**Decision (user, 18 October 2026):** stored data must stay reachable when the indexer is unavailable; the UI shows the stored height and the height the frontend serves when they differ.

## Review Focus

1. Indexer up: behaviour unchanged (proxy first). Indexer down: same paths answer from disk with identical status codes and headers (200, 206 with `Content-Range`, 304 on matching ETag, 404 outside the allow list).
2. Path traversal through the disk fallback (`..`, encoded `%2e%2e`, absolute paths, symlinks out of the data root) returns 404.
3. No store on disk and indexer down: 503 with JSON `{ "error": "no indexed data" }`, and the UI shows that message.
4. Heights: when the live tail is ahead of stored data, the UI says so (`stored 745,125 · serving 745,301 · chain 745,304`); when the live tail is off or behind, it shows stored and chain only. Lag figures in blocks and in time (2 s blocks).
5. The web container mounts the data read only; it never writes there.

---

### Task 1: Disk fallback in the data route

**Files:**
- Create: `apps/web/lib/disk-data.ts`
- Modify: `apps/web/lib/proxy.ts` (or the route) to fall back when the upstream fetch throws or returns 502, 503 or 504
- Modify: `docker-compose.yml` (web gets `${INDEX_DATA_PATH:-./data}:/data:ro` and `DATA_DIR=/data`)
- Test: `apps/web/test/disk-data.test.ts`

**Interfaces:**
- `resolveStoreDir(dataDir: string): Promise<string | null>` (same rule as the indexer: `active-generation.json` if present, else the single `<chainId>-<hash>` directory holding `manifest.json`)
- `serveFromDisk(req: Request, path: string[], dataDir: string): Promise<Response>` with the same allow list as the proxy, `Accept-Ranges`, single range `Range: bytes=a-b` support, ETag from size and mtime, `Cache-Control` values matching `apps/indexer/src/http.ts`, and header `x-served-by: disk`
- Health path on disk returns `{ "source": "disk", "headBlock": <manifest headBlock or delta toBlock>, "lastSnapshot": <snapshotBlock> }`

- [ ] **Step 1: Write failing tests** with a temp data dir: manifest 200 with ETag; parquet range 206 with correct bytes; matching ETag 304; traversal 404; empty dir 503; fallback used when the fake upstream fetch rejects, not used when it returns 200.
- [ ] **Step 2:** `bun test apps/web/test/disk-data.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with `node:fs/promises` (the web server runs on Node, not Bun).
- [ ] **Step 4:** Run all web tests and `bunx tsc --noEmit -p apps/web`. Expected: PASS.

### Task 2: Heights in the top bar

**Files:**
- Modify: the TopBar from plan 10 (or `StatusBar` if plan 10 is not merged), `apps/web/lib/use-index.ts` only if a value is missing
- Create: `apps/web/lib/heights.ts`
- Test: `apps/web/test/heights.test.ts`

**Interfaces:**
- `describeHeights(h: { chain?: number; stored?: number; snapshot?: number; serving?: number; source?: 'indexer' | 'disk' }): { items: { label: string; block: number }[]; lagBlocks?: number; lagText?: string; state: 'live' | 'behind' | 'stale' | 'unknown' }`
  - `stored` = delta `toBlock` (fallback manifest `headBlock`), `snapshot` = manifest `snapshotBlock`, `serving` = live tail block, `chain` = `eth_blockNumber`.
  - `state`: `live` when `max(stored, serving)` is within 10 blocks of chain, `behind` within 1,800 blocks, `stale` beyond, `unknown` when chain is missing.
  - `lagText` like `9 blocks (18 s)` or `2.1 h behind`.
- TopBar shows chain, stored, serving (only when present and different from stored), a colored state chip with icon and label (never color alone), and `served from disk` when the data source header says so (read `x-served-by` from the manifest response).

- [ ] **Step 1: Write failing tests** for `describeHeights` covering live, behind, stale, unknown, serving ahead of stored, serving absent.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and wire into the TopBar.
- [ ] **Step 4:** `bun test` and `bun run build` in `apps/web`. Expected: PASS and success.
