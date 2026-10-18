# Plan 10: Analytics Dashboard Redesign

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `apps/web/AGENTS.md` and the relevant Next.js 16 guides under `apps/web/node_modules/next/dist/docs/`
3. Current UI: `apps/web/app/page.tsx`, `apps/web/components/*`, `apps/web/lib/tiles.ts`, `apps/web/lib/use-index.ts` (read `IndexDb.run` signature in `apps/web/lib/indexdb.ts`, do not edit that file)

**Goal:** Replace the plain page with an analytics dashboard in the spirit of Dune and block explorer stats pages. The pitch it must make visible: full SQL over live Arkiv data, many predefined views that `arkiv_query` cannot express, and millisecond query times measured in the browser.

**Architecture:** Every widget is a predefined SQL query (`lib/views.ts`) run through the existing `IndexDb.run`. A widget card shows its title, chart, measured run time, row count, and its SQL on demand. Tabs group widgets into views. Timing is measured with `performance.now()` around `db.run` in a shared hook, so the number includes the worker round trip and is honest.

**Tech Stack:** Next.js 16 client components, CSS modules or plain CSS (no Tailwind, no new dependencies, no web fonts; system font stack and `ui-monospace`), `recharts` (installed), `@uiw/react-codemirror` (installed).

**Boundaries:** Plan 09 is merged. Do not change the data layer behaviour in `apps/web/lib/indexdb.ts` or `apps/web/lib/live-tail.ts` beyond exposing values the UI needs (for example a getter). Do not touch `packages/` or `apps/indexer` (plan 12 is changing them in parallel) or `docker-compose.yml`.

## Review Focus

1. A widget whose SQL fails shows the DuckDB error inside its card; other widgets still render.
2. Empty results (fresh index, zero rows) render an "No rows yet" state, never a broken chart or NaN axis.
3. Run time badge shows real measured time with one decimal (`1.7 ms`); it is never a hard coded number. When a query takes 100 ms or more, show it as is.
4. Widgets re-run when the data version changes (new delta or live tail block) without flicker: keep previous result until the new one arrives.
5. Layout works at 1440 px and at 390 px (phone) width with no horizontal page scroll; tables scroll inside their card.

---

### Task 1: Predefined views and timing hook

**Files:**
- Create: `apps/web/lib/views.ts`, `apps/web/lib/use-query.ts`, `apps/web/lib/format.ts`
- Test: `apps/web/test/views.test.ts`, `apps/web/test/format.test.ts`

**Interfaces:**
- `type Widget = { id: string; title: string; subtitle?: string; sql: string; kind: 'stat' | 'area' | 'bar' | 'stacked-bar' | 'donut' | 'table' | 'histogram'; x?: string; y?: string | string[]; series?: string; span?: 1 | 2 | 3; notInArkivQuery?: string }` (`notInArkivQuery` is a short reason such as `GROUP BY + JOIN`, shown as a badge)
- `type View = { id: string; title: string; description: string; widgets: Widget[] }`
- `VIEWS: View[]` with at least these views and widgets (SQL against the public views `entities` and `attributes`; blocks are 2 s, so 1,800 blocks per hour; `live_head` holds the current head):
  - `overview`: stats for live entities, distinct creators, distinct owners, expiring within 1 hour, created in the last 1,800 blocks; area chart of creations per hour (last 24 h); donut of entities by `type` attribute (top 7 plus Other); table of the 10 most recently updated entities.
  - `expiry`: histogram of hours until expiry (buckets 0 to 1, 1 to 6, 6 to 24, 1 to 7 days, over 7 days); table of entities expiring next; stacked bar of expiry bucket by `type`; stat of median remaining lifetime.
  - `creators`: top 10 creators by live entities (bar); creator vs current owner transfers (rows where `owner <> creator`) count and table; creators by number of distinct types (table with JOIN).
  - `attributes`: attribute names by usage count and value type (table); numeric attribute stats for `num` (min, avg, max per attribute name, GROUP BY); top values of `status` and `priority` if present.
  - `activity`: entities updated per 100 blocks over the last 3,000 blocks (bar); create vs update ratio (`created_at = updated_at` as never modified); window function example: running count of creations ordered by `created_at` (`notInArkivQuery: 'window function'`).
- Mark widgets that use GROUP BY, JOIN, ORDER BY on an attribute, window functions or aggregates beyond count with `notInArkivQuery`.
- `useTimedQuery(sql: string, version: number): { data?: { columns: string[]; rows: unknown[][] }; ms?: number; error?: string; loading: boolean }` (keeps previous data while re running)
- `format.ts`: `shortHex(v: string)` (`0x1234…abcd`), `blockAge(block: number, head: number)` (`12 s`, `5 min`, `3 h`, `2 d`), `formatMs(ms: number)` (`0.8 ms`, `12.4 ms`), `compact(n: number)` (`1.2k`, `30.7k`).

- [ ] **Step 1: Write failing tests:** every widget SQL in `VIEWS` executes against an in memory node DuckDB seeded with `RAW_TABLES_SQL`, `MERGE_VIEWS_SQL`, a head, and 12 synthetic entities across 3 types and 3 creators with attributes `type`, `status`, `priority` (u64); each returns the columns named in `x`/`y`/`series`; widget ids are unique; format helpers on the listed examples.
- [ ] **Step 2:** `bun test apps/web/test/views.test.ts apps/web/test/format.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.

### Task 2: Implement the approved mock

**Source of truth:** `docs/design/dashboard-mock.html` (approved by the user on 18 October 2026). Open it and reproduce its layout, tokens, components and interactions in React. Its CSS tokens (`--surface`, `--card`, `--c1`..`--c8`, `--sx-*`, `--font-ui`, `--font-mono`, ...) and class structure may be ported directly into `apps/web/app/theme.css` or CSS modules. Its numbers and table rows are sample data: every value on the real page comes from SQL run in DuckDB WASM, and every run time badge is measured.

**Files:**
- Create: `apps/web/app/theme.css`, `apps/web/components/dash/` with one file per mock component: `TopBar`, `HeightsCluster`, `StateChip`, `ThemeToggle`, `Hero`, `StatTile`, `RunBadge`, `WhySqlStrip`, `ShowcaseGallery`, `ViewTabs`, `WidgetCard`, `NotInArkivQueryBadge`, `SqlBlock`, `AreaChart`, `DonutChart`, `HBarChart`, `StackedBarChart`, `ColumnChart`, `DataTable`, `TypeTag`, `QueryConsole`, `QueryHistory`, `ResultsGrid`, `RowActions`, `VerifyChip`, `ActivityFeed`, `EventPill`, `Footer`, `Tooltip`
- Create: `apps/web/lib/heights.ts` and `apps/web/test/heights.test.ts` (interface `describeHeights` exactly as in `docs/plans/11-indexer-independent-serving.md` Task 2; it feeds `HeightsCluster`)
- Modify: `apps/web/app/page.tsx`, `apps/web/app/layout.tsx`, `apps/web/app/globals.css`
- Remove from the page (files may stay if imported elsewhere): the old `StatusBar` text block, RPC URL input, error banners, old `Dashboard`/`Tile` grid

**Rules:**
- Charts may be hand rolled SVG as in the mock, or `recharts` styled to match; keep hover tooltips on every chart and legends for 2 or more series.
- Section order as in the mock: TopBar, Hero with stat tiles and WhySqlStrip, Showcase queries (tabs and widget cards), Console, Latest changes, Footer.
- Errors stay inside the affected card (small muted message); indexer or RPC trouble shows only as the `HeightsCluster` state chip (`behind`, `stale`, `disk`) and its popover. No banners, no RPC URL input.
- Theme: dark default, light via toggle, `prefers-color-scheme` honoured until the user picks; choice stored in `localStorage` inside try/catch.

**Fixes to the mock (user approved):**
1. The index covers every entity (blank `INDEX_EXPRESSION`). The top bar shows an "all entities" chip instead of "$creator filtered" when the manifest expression is empty, and the `$creator` chip only when the expression has a `$creator` term. Add a showcase widget "Entities by creator" in the Creators view that demonstrates `$creator` filtering in SQL.
2. Most live entities are load test data without a `type` attribute. Group by `type`, falling back to `project`, then to `unlabelled`, via `COALESCE`. Support desk widgets (tickets, comments, priority, status, the console's default "open tickets with most discussion" query) must not assume those attributes exist chain wide: they return rows only where they exist and render the empty state otherwise.
3. The gallery heading counts the real number of widgets. The SQL Copy button copies to the clipboard (`navigator.clipboard.writeText` in try/catch).
4. Dark theme is the default.
5. `ActivityFeed` reads its rows from the existing live tail / changes feed data (`apps/web/components/ChangesFeed.tsx` logic, `live_*` tables, or delta); do not invent a separate RPC poller.

- [ ] **Step 1:** Build the components, wired to `VIEWS` (Task 1) and `useTimedQuery`. Keep each component under about 200 lines.
- [ ] **Step 2:** `bun run build` in `apps/web`. Expected: success, no type errors.
- [ ] **Step 3:** `bun test` in `apps/web`. Expected: all pass.

### Task 3: Report

- [ ] Write `CODEX-REPORT.md`: files changed, test and build output, any widget that could not be expressed and why, screenshots are done by Claude.
