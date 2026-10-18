# Plan 10: Analytics Dashboard Redesign

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `apps/web/AGENTS.md` and the relevant Next.js 16 guides under `apps/web/node_modules/next/dist/docs/`
3. Current UI: `apps/web/app/page.tsx`, `apps/web/components/*`, `apps/web/lib/tiles.ts`, `apps/web/lib/use-index.ts` (read `IndexDb.run` signature in `apps/web/lib/indexdb.ts`, do not edit that file)

**Goal:** Replace the plain page with an analytics dashboard in the spirit of Dune and block explorer stats pages. The pitch it must make visible: full SQL over live Arkiv data, many predefined views that `arkiv_query` cannot express, and millisecond query times measured in the browser.

**Architecture:** Every widget is a predefined SQL query (`lib/views.ts`) run through the existing `IndexDb.run`. A widget card shows its title, chart, measured run time, row count, and its SQL on demand. Tabs group widgets into views. Timing is measured with `performance.now()` around `db.run` in a shared hook, so the number includes the worker round trip and is honest.

**Tech Stack:** Next.js 16 client components, CSS modules or plain CSS (no Tailwind, no new dependencies, no web fonts; system font stack and `ui-monospace`), `recharts` (installed), `@uiw/react-codemirror` (installed).

**Boundaries:** Plan 09 is changing `apps/web/lib/indexdb.ts`, `apps/web/lib/live-tail.ts` and `apps/web/components/StatusBar.tsx` in parallel. Do not edit those three files. Render `<StatusBar />` unchanged inside the new header area if needed, or read the same `useIndex()` state. Do not touch `packages/` or `apps/indexer`.

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

### Task 2: Visual system and layout

**Files:**
- Create: `apps/web/app/theme.css` (imported by `layout.tsx`), `apps/web/components/dash/*` (`TopBar`, `HeroStats`, `ViewTabs`, `WidgetCard`, `ChartRenderer`, `SqlBlock`, `ActivityFeed`, `WhySqlStrip`, `QueryConsole`)
- Modify: `apps/web/app/page.tsx`, `apps/web/app/layout.tsx`, `apps/web/app/globals.css`

Design direction (dark first, data dense, calm):
- Tokens on `:root`: surface `#0f1115`, card `#161a20`, card border `#232a33`, text primary `#e8eaed`, secondary `#9aa4b2`, muted `#6b7685`, accent `#3987e5`. Provide a light theme via `[data-theme="light"]` (surface `#fcfcfb`, card `#ffffff`, text `#0b0b0b`, secondary `#52514e`) and a toggle in the top bar; respect `prefers-color-scheme` when no choice is stored.
- Categorical chart colors in this fixed order (validated palette, dark values): `#3987e5`, `#d95926`, `#199e70`, `#c98500`, `#d55181`, `#008300`, `#9085e9`, `#e66767` (light: `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`, `#e87ba4`, `#008300`, `#6250d6`, `#e34948`). A series keeps its color by entity, not rank. More than 8 categories fold into "Other".
- Chart marks: 2 px lines, bars with 4 px rounded data ends, 2 px gaps between bars, recessive grid (`#232a33`), axis text in secondary color, tooltips on hover for every chart, legend when 2 or more series. Text never uses the series color.
- Fonts: system UI stack for text, `ui-monospace, SFMono-Regular, Menlo, monospace` for SQL, hashes and numbers; tabular numbers on stats.

Layout:
1. **TopBar:** product name "Arkiv SQL", chain pill (`Tiramisu 7738577`), live head block with a pulsing dot that ticks as `live_head` advances, snapshot version, indexed expression in mono (truncated, full on hover), `$creator` filter badge, theme toggle.
2. **HeroStats:** 5 stat tiles from the `overview` stats; each tile shows its value and a small `⚡ 1.4 ms` badge with the measured time; one extra tile "Queries this session" with count and median run time.
3. **WhySqlStrip:** one row explaining what SQL adds over `arkiv_query` (joins, GROUP BY, ORDER BY on attributes, window functions, no 200 row page limit), each item linking to a widget that demonstrates it.
4. **ViewTabs:** tabs for each `View`, with its description; a responsive 3 column grid of `WidgetCard`s honoring `span`.
5. **WidgetCard:** header with title, subtitle, `notInArkivQuery` badge, run time and row count (`1.7 ms · 34 rows`); body renders the chart or table; footer actions "SQL" (expands a `SqlBlock` with highlighted SQL and copy button), "Open in console" (loads SQL into the console and scrolls to it), "CSV".
6. **ActivityFeed:** reuse the data source of the current `ChangesFeed` (do not modify it; import its logic or wrap it) styled like an explorer activity list: colored event type pill, shortened key with copy, block, age.
7. **QueryConsole:** CodeMirror editor (existing autocomplete), Run with Ctrl or Cmd plus Enter, measured run time and row count after each run, query history of the last 10 queries in `localStorage` (wrapped in try/catch), example dropdown populated from all widget SQL, results grid with sticky header, monospace cells, shortened hashes with full value on hover, existing payload and verify row actions, CSV download.

- [ ] **Step 1:** Build the components. Keep every component under about 200 lines.
- [ ] **Step 2:** `bun run build` in `apps/web`. Expected: success, no type errors.
- [ ] **Step 3:** `bun test` in `apps/web`. Expected: all pass (update `test/helpers.test.ts` only if `lib/tiles.ts` is removed; prefer keeping it if other code imports it).

### Task 3: Report

- [ ] Write `CODEX-REPORT.md`: files changed, test and build output, any widget that could not be expressed and why, screenshots are done by Claude.
