# Plan 05: Web Scaffold, Data Proxy and Browser Data Layer

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `SPECS.md` §8, §9.0
3. `packages/core/src/views.ts` (plan 04 output)

**Goal:** Next.js app that proxies `/data/*` to the indexer and exposes a browser `IndexDb` that loads the snapshot, polls the delta, tracks the live head, and runs SQL.

**Architecture:** `app/data/[...path]/route.ts` forwards to `INDEXER_URL` through a pure `proxy(req, base, fetchImpl)` function (unit tested). `lib/indexdb.ts` wraps DuckDB WASM; its pure helpers (`applyDeltaSql`, `chainCheck`) are unit tested; the WASM part is checked by Claude in a browser.

**Tech Stack:** Next.js (App Router, `output: 'standalone'`), React, `@duckdb/duckdb-wasm` (jsDelivr bundles), `@asi/core`, `bun test`.

**Spec:** `SPECS.md`

## Review Focus

1. Proxy must not cache: two requests for `manifest.json` after the file changed return different bodies.
2. Proxy must reject `/data/index.duckdb`, `/data/../x` and absolute URLs in the path with 404 (no open proxy).
3. Snapshot version change: when the manifest version increases, base tables reload and delta tables clear before the new delta is applied (no double rows).
4. Indexer down: proxy returns 502 and the UI shows "indexer unavailable" instead of a blank page.
5. Manifest chain ID or genesis hash differs from RPC: `chainCheck` reports a mismatch.

---

### Task 1: Scaffold [Claude]

- [x] **Step 1 (done, Next.js 16.4.2; read `apps/web/AGENTS.md` and `apps/web/node_modules/next/dist/docs/` before writing Next code):** Claude creates `apps/web` with `create-next-app` (TypeScript, App Router, no Tailwind unless default, no `src/` dir), sets package name `@asi/web`, adds `@asi/core` workspace dependency, `@duckdb/duckdb-wasm`, `@uiw/react-codemirror`, `@codemirror/lang-sql`, `recharts`, and runs `bun install`.
- [ ] **Step 2:** `next.config` sets `output: 'standalone'` and `transpilePackages: ['@asi/core']`. `.env.example` gains `INDEXER_URL=http://localhost:8080` and `NEXT_PUBLIC_TIRAMISU_RPC_URL=https://rpc.tiramisu.db-chain.testnet.arkiv.network`.
- [ ] **Step 3:** `bun run build` in `apps/web` succeeds. Commit `chore(web): scaffold next app`.

### Task 2: Data proxy

**Files:**
- Create: `apps/web/lib/proxy.ts`, `apps/web/app/data/[...path]/route.ts`
- Test: `apps/web/test/proxy.test.ts`

**Interfaces:**
- Produces: `proxy(req: Request, path: string[], base: string, fetchImpl?: typeof fetch): Promise<Response>`; route exports `GET` and `HEAD` calling it with `process.env.INDEXER_URL ?? 'http://indexer:8080'`, plus `export const dynamic = 'force-dynamic'`.

- [ ] **Step 1: Write failing tests** with a fake fetch:
  - `forwards range and conditional headers`: incoming `range`, `if-none-match`, `if-modified-since` arrive upstream; `cookie` and `authorization` do not.
  - `passes 206 through`: upstream 206 with `content-range`, `content-length`, `accept-ranges`, `etag`, `cache-control`, `content-type` returns the same status and headers and the same body bytes.
  - `passes 304 through` with no body.
  - `rejects disallowed paths` (`['index.duckdb']`, `['..','x']`, `['snap','v1','x.parquet']`) with 404 and no upstream call.
  - `upstream failure gives 502`.
  - `uses no-store`: fake fetch receives `cache: 'no-store'`.
- [ ] **Step 2:** `bun test apps/web/test/proxy.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Allowed paths match `manifest.json`, `delta.json`, `health`, `snap/v<digits>/(entities|attributes).parquet`. Stream `upstream.body`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(web): data proxy`.

### Task 3: Browser data layer

**Files:**
- Create: `apps/web/lib/rpc-browser.ts`, `apps/web/lib/indexdb.ts`, `apps/web/lib/use-index.ts`
- Test: `apps/web/test/indexdb.test.ts` (pure helpers only)

**Interfaces:**
- Consumes: `RAW_TABLES_SQL`, `MERGE_VIEWS_SQL`, `setHeadSql`, `loadSnapshotSql`, `Manifest`, `Delta`, `createRpc` (no API key in the browser).
- Produces:
  - `applyDeltaSql(delta: Delta): string[]` (clears the three delta tables, inserts rows with escaped literals; empty arrays give only the clears)
  - `chainCheck(m: Manifest, chainId: number, genesisHash: string): { ok: boolean; reason?: string }`
  - `class IndexDb { static create(origin: string, rpcUrl: string): Promise<IndexDb>; start(onState: (s: IndexState) => void): void; stop(): void; run(sql: string): Promise<{ columns: string[]; rows: unknown[][]; truncated: boolean }>; cancel(): Promise<void>; schema(): Promise<Record<string, string[]>> }`
  - `type IndexState = { status: 'loading' | 'ready' | 'error'; error?: string; manifest?: Manifest; deltaTo?: number; liveHead?: number; chainOk?: boolean }`
  - `useIndex(): { db: IndexDb | null; state: IndexState }` React hook (client only, single shared instance)

- [ ] **Step 1: Write failing tests** for `applyDeltaSql` (quote escaping in `'it''s'`, numbers unquoted, `num null` as `NULL`, empty delta) and `chainCheck` (match, chain mismatch, genesis mismatch with reason text).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `IndexDb.create` loads DuckDB WASM with `getJsDelivrBundles()` and `selectBundle`, in a worker. `start` polls `/data/manifest.json` every 10 s (reload snapshot when `version` changes, then clear delta tables), `/data/delta.json` every 2 s with `If-None-Match`, and `eth_blockNumber` every 2 s for `setHeadSql`. Snapshot URLs are absolute (`origin + '/data/' + path`). `run` caps materialised rows at 1,000 (`truncated` true when more). `schema` reads `information_schema.columns` for views `entities` and `attributes`.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** **[Claude]** with the indexer running locally, open the app in Chrome, run `SELECT count(*) FROM entities` from the console hook, confirm a value and that `live_head` advances. Commit `feat(web): browser data layer`.
