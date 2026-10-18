# Plan 06: Dashboard, SQL Editor and Row Actions

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `SPECS.md` §9.1 to §9.3
3. Plan 05 output: `apps/web/lib/indexdb.ts`, `apps/web/lib/use-index.ts`

**Goal:** One page with a status header, analytics tiles, a SQL editor with highlighting and schema aware autocomplete, a results table, and per row payload and verify actions.

**Architecture:** Client components only. Every tile's SQL lives in `lib/tiles.ts` so "View SQL" opens the exact text in the editor. Verify and payload call Arkiv RPC directly from the browser without an API key (one `arkiv_query` per click). Pure logic (`classifyVerify`, `sqlCompletions`, `toCsv`, hash state) is unit tested.

**Tech Stack:** Next.js client components, `@uiw/react-codemirror`, `@codemirror/lang-sql`, `recharts`, `bun test`.

**Spec:** `SPECS.md`

## Review Focus

1. A query error (syntax, unknown column) shows the DuckDB message under the editor and keeps the previous results; the page never crashes.
2. A result of 1,000+ rows shows "showing first 1000 rows"; CSV export uses the full result by re-running with no cap.
3. Verify on a result without a `key` column: the button is hidden.
4. Verify when the browser's anonymous budget is exhausted (HTTP 429 `ANON_COST_LIMITED`): the row shows "RPC budget exhausted, retry later", not "deleted".
5. BigInt and long hex values render as text, not `[object Object]` or rounded numbers.

---

### Task 1: Pure helpers

**Files:**
- Create: `apps/web/lib/tiles.ts`, `apps/web/lib/verify.ts`, `apps/web/lib/sql-complete.ts`, `apps/web/lib/csv.ts`, `apps/web/lib/hash-state.ts`
- Test: `apps/web/test/helpers.test.ts`

**Interfaces:**
- Produces:
  - `TILES: { id: string; title: string; sql: string; kind: 'number' | 'bar' | 'line' | 'table' }[]` with ids `live`, `expiring_hour`, `by_type`, `created_per_hour`, `expiry_horizon`, `top_creators`. Blocks convert to hours with 1,800 blocks per hour (2 s blocks). `by_type` groups `attributes` where `name = 'type'`.
  - `type VerifyStatus = 'ok' | 'stale' | 'extended' | 'expired' | 'deleted' | 'error'`
  - `classifyVerify(row: { updated_at: number; expires_at: number }, chain: { updatedAt: number; expiresAt: number } | null, head: number): VerifyStatus` (null chain means not found; `extended` when chain expiry greater and same `updatedAt` is impossible, so check order: null gives `deleted` (the node also omits expired entities, so null covers both), `chain.expiresAt <= head` gives `expired`, `chain.updatedAt > row.updated_at` gives `extended` when only `expiresAt` grew else `stale`, equal gives `ok`)
  - `verifyRows(rpcUrl: string, keys: string[]): Promise<Map<string, { updatedAt: number; expiresAt: number; owner: string } | null>>` (queries from `keyChunkQueries(null, keys)`, 50 keys each, select `key, updatedAt, expiresAt, owner`; throws `RpcError` on 429)
  - `sqlCompletions(schema: Record<string, string[]>): { schema: Record<string, string[]> }` (shape for `@codemirror/lang-sql` `sql({ schema })`)
  - `toCsv(columns: string[], rows: unknown[][]): string` (RFC 4180 quoting; bigint as decimal text)
  - `readHash(): string | null`, `writeHash(sql: string): void` (base64url of UTF 8 SQL)
- [ ] **Step 1: Write failing tests:** every `classifyVerify` branch; `toCsv` quoting of comma, quote, newline, bigint; hash round trip with non ASCII; each tile SQL executes against an in memory node DuckDB seeded with `RAW_TABLES_SQL`, `MERGE_VIEWS_SQL` and three rows (no SQL errors).
- [ ] **Step 2:** `bun test apps/web/test/helpers.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(web): tiles, verify and editor helpers`.

### Task 2: Page and components

**Files:**
- Create: `apps/web/app/page.tsx` (client), `apps/web/components/StatusBar.tsx`, `Dashboard.tsx`, `Tile.tsx`, `SqlEditor.tsx`, `ResultsTable.tsx`, `RowActions.tsx`, `ChangesFeed.tsx`
- Modify: `apps/web/app/layout.tsx`, `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `useIndex`, `TILES`, `classifyVerify`, `verifyRows`, `sqlCompletions`, `toCsv`, hash helpers.

- [ ] **Step 1:** `StatusBar`: chain ID, indexed expression, badge "filtered by $creator" or warning "no $creator filter", snapshot version, "as of block N", head lag in blocks, error banner for `chainOk false` or indexer unavailable.
- [ ] **Step 2:** `Dashboard`: grid of `Tile`s; each runs its SQL when the delta block changes, renders number, bar or line (recharts) or small table, and has "View SQL" that loads the SQL into the editor and scrolls to it.
- [ ] **Step 3:** `SqlEditor`: CodeMirror with `sql({ dialect: PostgreSQL, schema })` from `sqlCompletions(await db.schema())`, Cmd or Ctrl plus Enter runs, Run and Cancel buttons, examples dropdown (one join of `entities` with `attributes`, one `GROUP BY` over an attribute, one ORDER BY on a numeric attribute `num`), SQL stored with `writeHash` on run and restored with `readHash` on load.
- [ ] **Step 4:** `ResultsTable`: header, rows as text, truncation note, CSV download. When `key` is a column, `RowActions` per row: "Payload" (fetch `$key = key(k)` with `select { payload: true, contentType: true }`, show text if UTF 8 else hex, max 128 KiB) and "Verify" (button "Verify page" verifies all visible keys in chunks of 50 and shows a status chip per row plus "checked against <rpc url>, not a cryptographic proof").
- [ ] **Step 5:** `ChangesFeed`: polls `eth_getLogs` for the last 30 blocks every 4 s via the browser RPC, decodes event type with `ENTITY_EVENTS_ABI`, shows the last 20 events for keys present in `entities`.
- [ ] **Step 6:** `bun run build` in `apps/web`. Expected: success with no type errors.
- [ ] **Step 7:** **[Claude]** browser check in Chrome against the local indexer: every tile renders, autocomplete suggests `entities` columns, a bad query shows its error, verify marks rows `ok`. Commit `feat(web): dashboard and sql editor`.
