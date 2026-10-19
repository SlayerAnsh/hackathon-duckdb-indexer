# Widget dashboards plan 9: live dashboards redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

Dependencies to install first: none. Every task uses packages already in `apps/web` (recharts, react, next, `@arkiv-network/sdk`, viem). Icons are inline SVG.

## Required Reading

1. `docs/superpowers/plans/2026-10-20-widget-dashboards/CONTEXT.md`, all sections, especially section 11 (interfaces this plan adds).
2. UI doc `docs/superpowers/specs/2026-10-20-widget-dashboards-ui.md` section 10 (all of it) plus the sections each task names. Section 10 wins over older sections where they conflict.
3. Spec `docs/superpowers/specs/2026-10-20-widget-dashboards-design.md` sections 6.1, 9.8, 9.9 and 9.10.
4. The approved mock `.superpowers/brainstorm/58114-1792435182/content/live-dashboards-v5.html`. Copy CSS values from its `<style>` blocks; the later blocks (`v3`, `v4`, `v5`) override the earlier ones. Never copy the mock chrome (`.mockbar`, `.screen`, `.frame`, `.url`, `.sbar-note`, `.phone`, `demo-*` classes).
5. `apps/web/AGENTS.md`. Next.js 16 differs from older versions; read the named file under `apps/web/node_modules/next/dist/docs/` before using a Next API.

**Goal:** The whole app takes the approved v5 console look; the showcase becomes Official dashboards that live on Arkiv and are kept alive by the app wallet; `/explore` hosts dashboards and widgets; dashboards read like statistics reports; two chart types are added and time ranges are dropped.

**Architecture:** Tokens live in `app/theme.css`; a pure `lib/theme.ts` plus an inline head script set `data-theme` before paint. Official status is derived from data (`user` attribute equals the dashboard wallet), so no config or secret is involved. Seeding and keepalive are server operations that run through the existing serial write queue; keepalive is an in process timer started from `instrumentation.ts`. Lists come from local DuckDB, payloads from Arkiv RPC, as before.

**Tech Stack:** Next.js 16 app router, React 19, recharts 3, `@arkiv-network/sdk` 0.8.1, Bun test with `renderToStaticMarkup`.

## Global Constraints

- CONTEXT.md sections 2 (executor rules), 3 (commands), 4 (test conventions), 6, 8 and 10 apply. Codex has no network and cannot commit; the coordinator commits with the message in each task.
- Never add a dependency. Never print or log secret values; log variable names only.
- Docs prose (README, SPECS.md, DEVELOPER.md, CHANGELOG.md, `arkiv/*.md`) uses no dashes as punctuation (`—`, `–`, ` - `). `test/deployment.test.ts` enforces it.
- The UI is an end user demo: no operator or debug controls, no keepalive buttons, no seed buttons.
- Copy and layout come from UI §10; where a task names copy, it is quoted from there.
- Interaction logic lives in pure functions tested directly; components stay thin and are tested with `renderToStaticMarkup` string assertions. Components that need state for a test take an optional prop for the initial state (for example `open`).
- Hidden on hover means `opacity: 0; pointer-events: none`, never `display: none` or `visibility: hidden`, so controls stay keyboard reachable (UI §10.7).
- Keep every existing test passing. A test may change only where this plan changes the behaviour it pins; delete a test only together with the module it covers.
- Each task ends with one CHANGELOG.md bullet (`* ...`) at the top of the `## Unreleased` section.

## Review Focus

1. Official marker trust boundary: a user session can never write an entity with `user` equal to the wallet, and `asWidget`/`asDashboard` accept `login = arkiv` only when `user` equals the wallet. Pinned in Task 3.
2. Keepalive idempotency and queue use: a second run right after the first extends nothing; every write goes through `deps.queue.run`; a failing run is logged without secrets and does not stop the timer. Pinned in Task 4.
3. Seed idempotency: a slug that already exists as a live official dashboard is skipped and no write is sent; invalid definitions abort before any write. Pinned in Task 4.
4. No theme flash and storage safety: the head script sets `data-theme` before paint and survives a throwing `localStorage`. Pinned in Task 1.
5. Hover only widget actions stay reachable by keyboard (`:focus-within`) and touch (overflow button). Pinned in Task 7.
6. Histogram binning edge cases (nulls, a single distinct value, zero rows) and stacked bar validation. Pinned in Task 2.
7. Old payloads still parse and round trip byte for byte after the `bins` addition. Pinned in Task 2.

## Owner steps (coordinator, after merge)

- No new environment variable and no Dokploy job. Keepalive starts by itself in the web container when dashboards are enabled.
- Run the seed once against Tiramisu from the repository root with `DASHBOARD_PRIVATE_KEY` and `NEXT_PUBLIC_TIRAMISU_RPC_URL` exported (values from the root `.env.local`, never echoed): `bun apps/web/scripts/seed-official.ts --dry-run`, then `bun apps/web/scripts/seed-official.ts`. Run it while user traffic is low: the script has its own write queue, so a simultaneous user write from the web container can clash on the wallet nonce (rerun the script; it skips what exists).

---

### Task 1: Theme tokens, no flash toggle, navbar A, status bar on every page

**Files:**
- Create: `apps/web/lib/theme.ts`, `apps/web/test/theme.test.tsx`
- Modify: `apps/web/app/theme.css`, `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/components/dash/ThemeToggle.tsx`, `apps/web/components/dash/TopBar.tsx`, `apps/web/components/dash/Footer.tsx`, `apps/web/components/widgets/AccountButton.tsx`, every page that renders `<main>` (`components/landing/Home.tsx`, `app/about/page.tsx`, `app/me/page.tsx`, `app/d/[key]/page.tsx`, `app/d/[key]/edit/page.tsx`, `app/widgets/page.tsx`, `app/widgets/[key]/page.tsx`, `app/widgets/new/page.tsx`, `app/showcase/page.tsx`, `components/playground/Playground.tsx` or `app/playground/page.tsx`), `apps/web/test/landing.test.tsx`, `apps/web/test/statusbar.test.tsx`, `CHANGELOG.md`

**Why:** UI §10.1 to §10.4. Today `ThemeToggle` applies the theme in an effect (flash on load), light tokens exist only under `[data-theme="light"]`, the nav has boxed items and old routes, and `/me`, `/d/<key>`, `/widgets/*` and `/about` render `TopBar` without index state, so they have no status bar.

**Interfaces:**
- Produces `lib/theme.ts` exactly as CONTEXT §11.1. `THEME_INIT_SCRIPT` is a self contained IIFE string that references only the globals `window` and `document` (so a test can run it with `new Function('window', 'document', THEME_INIT_SCRIPT)`), reads `window.localStorage.getItem('arkiv-sql-theme')` inside `try/catch`, falls back to `window.matchMedia('(prefers-color-scheme: light)').matches` (also guarded), and sets `document.documentElement.dataset.theme` to `'light'` or `'dark'`.
- Produces in `components/dash/TopBar.tsx`: `NAV_ITEMS` and `isActiveRoute` exactly as CONTEXT §11.5; `nextMenuOpen(open: boolean, event: 'toggle' | 'escape' | 'navigate'): boolean`; `TopBarView(props: { pathname: string | null; state?: IndexState; menuOpen?: boolean; onMenu?(event: 'toggle' | 'escape' | 'navigate'): void; account?: React.ReactNode; theme?: React.ReactNode }): JSX.Element` (presentational, no hooks); `TopBar({ state }: { state?: IndexState })` calls `usePathname()` and `useIndex()` unconditionally, uses `state ?? useIndex().state`, holds the menu state, and renders `TopBarView` plus `StatusBar`.
- `ThemeToggle` keeps its name; it initialises from `document.documentElement.dataset.theme` in an effect, follows media changes while no choice is stored, and writes through `writeStoredTheme`.
- Consumes: `StatusBar`, `TopStateChip`, `StateChip` (unchanged markup), `AccountButton`.

- [ ] **Step 1: Write the failing tests** (`test/theme.test.tsx`, plus updates in `landing.test.tsx` and `statusbar.test.tsx`)
  - `readStoredTheme` returns `'light'` for a store holding `light`, `null` for `blue`, `null` for `undefined`, and `null` when `getItem` throws. `writeStoredTheme` does not throw when `setItem` throws.
  - `resolveTheme('light', false)` is `'light'`, `resolveTheme(null, true)` is `'light'`, `resolveTheme(null, false)` is `'dark'`. `nextTheme('dark')` is `'light'`.
  - Running `THEME_INIT_SCRIPT` with a fake `window` whose `localStorage.getItem` returns `light` sets `document.documentElement.dataset.theme` to `light`; with a `localStorage` getter that throws and `matchMedia(...).matches === true` it sets `light`; with `matchMedia` missing and no stored value it sets `dark`; it never throws.
  - `app/theme.css` read as text: the first `:root{` block contains `--surface:#121212`, `--accent-strong:#3ecf8e`, `--accent-ink:#06261a`, `--border-faint:#242424`, `--r-md:6px`; the file contains `@media (prefers-color-scheme:light)` (or with a space after the colon) wrapping `:root:not([data-theme="dark"])`, and a `:root[data-theme="light"]` block containing `--surface:#fbfbfa`, `--accent:#0d7a4d` and `--border-faint:#e9e9e7`. Normalise whitespace before matching.
  - `isActiveRoute` with the Explore item is true for `/explore`, `/d/0xabc`, `/widgets/0xabc` and `/widgets/new`, false for `/` and `/me`; with the Home item it is true only for `/`. Replace the existing "nav marks exactly the active route" test accordingly.
  - Static render of `TopBarView({ pathname: '/d/0x1', state: { status: 'ready', … } })`: exactly one `aria-current="page"`, on the Explore link; the links are `Home`, `Explore`, `Playground`, `About` in that order with hrefs `/`, `/explore`, `/playground`, `/about`; the markup contains `Skip to content` linking `#main`, the brand text `SQL Indexer`, a menu button with `aria-expanded="false"` and `aria-label="Open menu"`; with `menuOpen: true` the button reads `aria-label="Close menu"` and `aria-expanded="true"` and the sheet renders the four links.
  - `nextMenuOpen(false, 'toggle')` true, `nextMenuOpen(true, 'escape')` false, `nextMenuOpen(true, 'navigate')` false.
  - `Footer` markup links `/`, `/explore`, `/playground`, `/about` and contains no `/showcase`.
  - Static render of `TopBar` with no `state` prop (the default `DashAuthContext` value is enough): the markup contains `class="sbar"` (status bar present without a state prop). If `usePathname` cannot run outside the app router under Bun, render it inside the `PathnameContext` provider from `next/dist/shared/lib/hooks-client-context.shared-runtime` (check the installed path) rather than weakening the assertion.

- [ ] **Step 2: Run** `bun test ./apps/web/test/theme.test.tsx ./apps/web/test/landing.test.tsx ./apps/web/test/statusbar.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**
  - `theme.css`: replace both token blocks with the UI §10.1 values (dark on `:root`, light under the media query and under `:root[data-theme="light"]`, identical values in both light blocks). Restyle `.btn`, `.btn-primary`, `.btn-quiet`, `.btn-lg`, add `.btn-outline`, `.btn-sm`, `.chip` and variants (`.chip-warn`, `.chip-bad`, `.chip-ok`, `.chip-official`), `.ib`, `.ib-lg`, `.tip[data-tip]` tooltip, `.menu` and `.mi`, `.skip`, `.fchip`, `.tabs`/`.tab`/`.tab-n`, the nav (`.top`, `.brand`, `.brand-mark` in `--accent-strong` with `--accent-ink`, `.nav`, `.nav-a` with the 2px underline current state, `.nav-menu-btn`, `.nav-sheet`), `.theme-btn` (36px borderless), cards and panels per UI §10.2, the `forced-colors` and `prefers-reduced-motion` rules from UI §10.11. Keep every existing class name that other components use; restyle instead of renaming. Keep the status bar block and `body{padding-bottom:var(--status-h)}`.
  - `globals.css`: replace hard coded colors with tokens; the avatar button becomes the borderless `acct` style (avatar dot, short address, chevron).
  - `layout.tsx`: `<html lang="en" suppressHydrationWarning>` with a `<head>` that holds `<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}/>` (check `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md` for `<head>` in the root layout). `viewport.themeColor` becomes `[{ media: '(prefers-color-scheme: light)', color: '#fbfbfa' }, { media: '(prefers-color-scheme: dark)', color: '#121212' }]`.
  - `ThemeToggle`: moon and sun inline SVG (stroke 1.6, `currentColor`), labels per UI §10.2.
  - `TopBar`: three column grid per UI §10.3; phone sheet under 720px; Escape and link clicks close the sheet and return focus to the menu button; opening focuses the first link. The skip link is the first child.
  - `AccountButton`: logged out `.btn .btn-outline` with a plus icon, "Build your dashboard" ("Build" under 420px); logged in the borderless account button. Keep its existing behaviour and labels.
  - Every page's `<main>` gets `id="main"`. Pages without index state now get the status bar through the `TopBar` fallback; do not add `useIndex` calls to pages for this.
  - `Footer` links per the test. Copy elsewhere is unchanged in this task.
  - CHANGELOG line: "Console theme with dark and light modes, calm navigation and the index status bar on every page."

- [ ] **Step 4: Verify.** Run `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: 0 fail, clean type check.

- [ ] **Step 5: Commit (coordinator)**

```bash
git commit -m "feat(web): console theme with persisted light mode, calm navbar and status bar on every page"
```

### Task 2: Chart types `stacked-bar` and `histogram`; drop time range pickers

**Files:**
- Modify: `apps/web/lib/dash/schema.ts`, `apps/web/lib/dash/chart.ts`, `apps/web/lib/dash/editor-state.ts`, `apps/web/components/widgets/ChartPicker.tsx`, `apps/web/components/widgets/ChartIcon.tsx`, `apps/web/components/widgets/WidgetSettings.tsx`, `apps/web/components/widgets/WidgetPreview.tsx`, `apps/web/components/dash/AreaChart.tsx`, `apps/web/components/dash/WidgetCard.tsx`, `apps/web/lib/views.ts`, `apps/web/components/showcase/view-state.ts`, `arkiv/schema.md`, `CHANGELOG.md`
- Delete: `apps/web/test/time-range.test.ts`
- Test: `apps/web/test/dash-schema.test.ts`, `apps/web/test/dash-chart.test.tsx`, `apps/web/test/dash-editor.test.tsx`, `apps/web/test/views.test.ts`, `apps/web/test/showcase.test.tsx` (only the range parts)

**Why:** Owner decision 6 (UI §10.9, §10.10, spec §6.1). Internal `lib/views` kinds already include `stacked-bar` and `histogram` (vertical columns), but the widget schema cannot store them. Time range pickers exist only in the showcase card (`WidgetCard.tsx` `RangePicker`, `lib/views.ts` `TIME_RANGES`, `ranged`, `rangeOf`, `resolveWidget`, `bucketTimeLabel`, `view-state.ts` range helpers).

**Interfaces:**
- Produces in `schema.ts` exactly as CONTEXT §11.2. Parser rules: `stacked-bar` requires `stacking` `stack` or `percent` (error `mapping.stacking must be stack or percent for stacked-bar`); `histogram` requires `mapping.x` non null, `mapping.y` empty, `groupBy` null, `stacking` `off`, and `bins` in `HISTOGRAM_BINS` (absent means 20); any other chart drops `bins` from the parsed value.
- Produces in `chart.ts`: `histogramData(data: ResultData, column: string, bins: number, fmt: NumberFormat): ResultData` returning `{ columns: ['bin', 'count'], types: ['text', 'integer'], rows }`: non finite and null values are skipped; zero usable values give zero rows; when min equals max there is one bin labelled with that value; otherwise `bins` equal width bins from min to max, the last bin closed on the right, labels `${formatNumber(from, fmt)}–${formatNumber(to, fmt)}`. Also `stackReady(mapping: WidgetMapping): boolean` (true when `groupBy` is set or `y.length >= 2`).
- `toChartWidget`: `stacked-bar` maps to kind `stacked-bar` with `stacking` forced to `stack` when `off`; `histogram` maps to kind `histogram` with `x: 'bin'`, `y: ['count']`, `legend: false`. Existing `bar` behaviour is unchanged.
- `WidgetPreview`: for `histogram` it runs `histogramData` on the sorted result before rendering and shows `Binned from N rows` under the chart; for a `stacked-bar` that is not `stackReady` it shows `Pick a Group by column or a second Y column to stack.` instead of a chart.
- `editorReducer` `chart` action: switching to `stacked-bar` turns `stacking: 'off'` into `'stack'`; switching to `histogram` sets `mapping.x` to the first numeric result column found with `numericColumns` from `lib/table.ts` (or keeps a numeric current x), `y: []`, `groupBy: null`, `stacking: 'off'`, `bins: 20`; switching away from `histogram` removes `bins`.
- `CHART_LABELS` adds `'stacked-bar': 'Stacked bar'`, `histogram: 'Histogram'`. `pickerIndex(key, index)` wraps over `CHART_TYPES.length` (End goes to the last index). `ChartIcon` adds the two glyphs described in UI §10.9.
- `lib/views.ts` exports `HEAD_SQL`, `LABELLED_CTE`, `EXPIRY_BUCKET`, `EXPIRY_BUCKET_ORDER` (the existing private `head`, `labelled`, `bucket`, `bucketOrder` strings) and `bucketedSql(column: 'created_at' | 'updated_at', blocks: number, bucket: 1800 | 300): string` returning columns `label` and `count` ordered by bucket, with `label` `now` for the newest bucket and otherwise `-<k>h` (bucket 1800, k whole hours before the head bucket) or `-<k*10>m` (bucket 300). The `creations` widget becomes fixed `Creations per hour` with subtitle `Last 24 hours · live entities only`, `x: 'label'`, SQL `bucketedSql('created_at', 43200, 1800)`; `updates` becomes `Updates per 10 min`, subtitle `Last 5 hours · current state of live entities`, `bucketedSql('updated_at', 9000, 300)`. Remove `TimeRange`, `TIME_RANGES`, `Ranged`, `ranged`, `rangeOf`, `resolveWidget`, `widgetSql`, `bucketTimeLabel` and the `timeRange`/`activeRange` widget fields.

- [ ] **Step 1: Write the failing tests**
  - `parseWidgetPayload` accepts a `stacked-bar` with `groupBy: 'type'`, `stacking: 'stack'`; rejects it with `stacking: 'off'` with the exact message above. Accepts a `histogram` with `x: 'hours'`, `y: []`, no `bins`, and the parsed value has `mapping.bins === 20`; rejects `bins: 15`, a non empty `y`, and `x: null`. A `bar` payload carrying `bins: 30` parses with no `bins` key. `JSON.stringify(parseWidgetPayload(validWidget).value)` equals `JSON.stringify(validWidget)` (old payloads round trip).
  - `histogramData` over values `[0, 1, 2, … 9]` with 5 bins gives 5 rows with counts `[2, 2, 2, 2, 2]` and the first label `0–2` (format `0,0`); values `[3, 3, 3]` give one row `['3', 3]`; values `[null, 'x', NaN]` give zero rows; the maximum value lands in the last bin.
  - `toChartWidget` of a `stacked-bar` with `stacking: 'off'` gives kind `stacked-bar` and stacking `stack`; of a `histogram` gives kind `histogram`, `x: 'bin'`, `y: ['count']`.
  - Editor: dispatching `{ type: 'chart', value: 'stacked-bar' }` on a draft with `stacking: 'off'` yields `stack`; dispatching `histogram` after a run with columns `name text, hours double` yields `mapping.x === 'hours'`, `y: []`, `bins: 20`; switching back to `bar` removes `bins`.
  - `pickerIndex('End', 0)` is `CHART_TYPES.length - 1`; `pickerIndex('ArrowRight', CHART_TYPES.length - 1)` is 0.
  - Static render of `ChartPicker` shows nine radios including `Stacked bar` and `Histogram`. Static render of `WidgetSettings` for a histogram draft shows `Value column` and a `Bins` select with options `10 20 30 50`, and does not show `Group by`, `Stacking` or `Y / values`; for a stacked bar it shows `Stack` and `100%` and no `Off`.
  - `views.test.ts`: every widget still executes on the populated and empty views (drop the `TIME_RANGES` loop); with head 50000 the creations query's first row label is `-24h` and its last row label is `now`, and the updates query's last row label is `now`.
  - No module imports `TIME_RANGES`, `resolveWidget` or `bucketTimeLabel` (assert by reading `components/dash/WidgetCard.tsx` and `components/dash/AreaChart.tsx` as text and checking those names are absent, and that `WidgetCard` markup has no `Time range` group).

- [ ] **Step 2: Run** the touched test files. Expected: FAIL.

- [ ] **Step 3: Implement** per the interfaces. For the histogram look use touching columns: check the `barCategoryGap` prop on `BarChart` in `apps/web/node_modules/recharts/types` before using it, and pass a small gap only for kind `histogram`. Settings per UI §10.9 (fields that do not apply are hidden, not disabled). Remove the range picker and the range parameters from `WidgetCard` and `view-state.ts` (keep `viewFromSearch`/`searchForView` for now). Update `arkiv/schema.md`: the chart list gains `stacked-bar` and `histogram`, and the payload section explains `mapping.bins` (10, 20, 30 or 50, histogram only). CHANGELOG line: "Stacked bar and histogram widgets; time range pickers removed."

- [ ] **Step 4: Verify.** Run `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: 0 fail, clean type check.

- [ ] **Step 5: Commit (coordinator)**

```bash
git commit -m "feat(web): stacked bar and histogram widgets, fixed windows instead of time range pickers"
```

### Task 3: Official marker and Official dashboard definitions

**Files:**
- Create: `apps/web/lib/dash/official.ts`, `apps/web/lib/dash/official-defs.ts`, `apps/web/test/dash-official.test.ts`
- Modify: `apps/web/lib/dash/entities.ts`, `apps/web/lib/dash/sql.ts` (`dashCte` slug column), `apps/web/lib/dash/server/auth.ts`, `apps/web/lib/dash/server/operations.ts`, `apps/web/test/dash-fakes.ts` (official row helpers), `arkiv/schema.md`, `CHANGELOG.md`
- Test: also `apps/web/test/dash-entities.test.ts`, `apps/web/test/dash-auth.test.ts`, `apps/web/test/dash-ops-widgets.test.ts`

**Why:** Owner decision 2 and spec §9.8. The marker is "the `user` attribute equals the dashboard wallet" (justification in spec §9.8). The showcase queries are split into four Official dashboards.

**Interfaces:**
- Produces CONTEXT §11.3 (marker, entity changes, server guard, `dashCte` `slug` column) and the `lib/dash/official-defs.ts` part of §11.4.
- `OFFICIAL_DASHBOARDS` holds four definitions in this order. Every widget has `lifetimeDays: 90`, format defaults from `emptyWidget()`, and SQL reused from `lib/views.ts` constants and widget SQL where named. Counters use `counter: { column: 'value', row: 0, prefix: '', suffix: '', label: '', decimals: 0, compact: false }` (decimals 1 for the median) with SQL that returns a `value` column.
  1. `network-overview`, "Arkiv network overview", description "The live dataset at a glance: volume, creators, entity types and what expires next on the Tiramisu testnet." Widgets: counters xs "Live entities", "Distinct creators", "Expiring within 1 hour", "Created in the last hour" (SQL of `components/landing/stats.ts` `FIGURE_SQL`); area md "Creations per hour" (`bucketedSql('created_at', 43200, 1800)`, x `label`, y `count`); donut md "Entities by type" (views `types`, x `type`, y `count`); table xl "Recently updated entities" (views `recent`).
  2. `expiry-watch`, "Expiry watch", "How long live entities have left, by bucket and by type. One block is two seconds." Widgets: counters xs "Median hours left", "Expiring within 24 hours", "Living longer than 7 days"; histogram md "Hours left, sample of 5,000" (`SELECT (expires_at::DOUBLE - ${HEAD_SQL}) / 1800 AS hours_left FROM entities ORDER BY hash(key) LIMIT 5000`, x `hours_left`, bins 20); bar md "Expiry horizon" (views `horizon`, x `bucket`, y `count`); stacked-bar xl "Expiry bucket by type" (views `expiry-types`, x `bucket`, y `count`, groupBy `type`, stacking `stack`); table xl "Expiring next" (views `next-expiry`).
  3. `creators`, "Creators", "Who writes the most, who owns what, and how varied each creator's data is." Widgets: counters xs "Largest creator's entities" (`SELECT max(n) AS value FROM (SELECT count(*) AS n FROM entities GROUP BY creator)`), "Entities transferred", "Creators with one entity", "Distinct owners"; hbar md "Top 10 creators" (views `top-creators`, x `creator`, y `count`); table md "Creators by distinct types" (views `creator-types`); table xl "Creator vs current owner" (views `transferred`).
  4. `attributes-activity`, "Attributes and activity", "Attribute names and values in use, and how entities change over time." Widgets: bar md "Updates per 10 min" (`bucketedSql('updated_at', 9000, 300)`, x `label`, y `count`); donut md "Create vs update" (views `modified`, x `state`, y `count`); area xl "Running count of creations" (views `running`, x `created_at`, y `running_count`); hbar md "Top status values" and hbar md "Top priority values" (views `status`, `priority`, x `value`, y `count`); table xl "Attribute usage and value types" (views `attribute-usage`); table xl "Numeric attribute statistics" (views `numeric`).
- Counter SQL that came from views stat widgets drops the `total` and note columns: return only `value`.

- [ ] **Step 1: Write the failing tests** (`dash-official.test.ts` plus the named existing files)
  - `isOfficialUser(W, W.toUpperCase().replace('0X', '0x'))` true; `isOfficialUser(U, W)` false; `isOfficialUser('nope', W)` false.
  - `officialExpr(W)` contains `$creator = addr(` with the wallet, `project = str('arkiv-sql-indexer-dash')` and `user = addr(` with the wallet.
  - `asDashboard` of a row with `user = W`, `login = arkiv`, `slug = network-overview` returns `official: true`, `login: 'arkiv'`, `slug: 'network-overview'`; the same row with `user = U` and `login = arkiv` returns null; a normal user row returns `official: false`, `slug: null`; a slug of `Bad Slug` gives `slug: null` but the dashboard still parses. `asWidget` follows the same login rule. `asLink` of a link with `user = W` has `official: true`.
  - Session creation (`dash-auth.test.ts` harness): when the recovered address equals the configured wallet the handler answers 403 `forbidden` and sets no cookie.
  - Each user write operation (`createWidget`, `updateWidget`, `extendWidget`, `deleteWidget`, `createDashboard`, `updateDashboard`, `deleteDashboard`, `organizeDashboard`, `addLink`) called with a session whose address equals `deps.wallet` rejects with the `forbidden` dash error and sends no client call (assert the fake client recorded zero calls).
  - `OFFICIAL_DASHBOARDS` has slugs `['network-overview', 'expiry-watch', 'creators', 'attributes-activity']`; every slug matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`; every title and description passes `parseDashboardPayload`; every widget passes `parseWidgetPayload` (which includes `checkWidgetSql`) and its parsed value equals the definition; each dashboard has at most 48 widgets; at least one widget uses `stacked-bar` and one uses `histogram`.
  - Every official widget SQL executes on the populated public views using the same DuckDB setup as `views.test.ts` (copy its seeding block into a shared helper in the test file if needed), and returns the columns its mapping names (`counter.column`, `mapping.x`, every `mapping.y`, `mapping.groupBy`).
  - `dashCte(W)` output contains `AS slug`.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-official.test.ts` and the touched files. Expected: FAIL.

- [ ] **Step 3: Implement.** `entities.ts`: `login(e, wallet)` accepts `LOGINS` values, or `OFFICIAL_LOGIN` only when `attrs.user` equals the wallet; set `official` with `isOfficialUser`; parse `slug` with the regex and a 64 byte cap. Server guard: a small `requireUser(deps, s)` at the top of each write job (before any read) and the same check in session creation (`auth.ts`, where the recovered address is known); both throw `dashErrors.forbidden()`. `arkiv/schema.md`: a section "Official entities" (marker rule, `login = arkiv`, `slug` attribute on official dashboards, 90 day lifetimes, renewed by the app wallet, and why a user cannot forge one), written without dashes as punctuation. CHANGELOG line: "Official dashboards: entities whose user is the app wallet, defined from the former showcase queries."

- [ ] **Step 4: Verify.** Run `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: 0 fail, clean type check.

- [ ] **Step 5: Commit (coordinator)**

```bash
git commit -m "feat(web): official marker from the wallet user attribute and official dashboard definitions"
```

### Task 4: Seed script and keepalive

**Files:**
- Create: `apps/web/lib/dash/server/official.ts`, `apps/web/lib/dash/server/keepalive.ts`, `apps/web/lib/dash/server/seed-cli.ts`, `apps/web/scripts/seed-official.ts`, `apps/web/instrumentation.ts`, `apps/web/test/dash-official-ops.test.ts`
- Modify: `apps/web/lib/dash/server/deps.ts` (`buildOps`), `apps/web/test/dash-fakes.ts` (fake chain support for `executeBatch` extensions and `predictEntityKeys` counts if missing), `DEVELOPER.md`, `CHANGELOG.md`

**Why:** Owner decisions 3 and 4, spec §9.8 and §9.9. Writes must share the serial write queue (CONTEXT §5: `predictEntityKeys` and the send must sit in one queue slot).

**Interfaces:**
- Produces CONTEXT §11.4 (`seedOfficial`, `keepOfficialAlive`, `readOfficialEnv`, `buildOps`, `startOfficialKeepalive`, `startKeepaliveFromEnv`).
- `seed-cli.ts`: `export function runSeedCli(argv: string[], env: Record<string, string | undefined>, io: { makeOps(cfg: { privateKey: \`0x${string}\`; rpcUrl: string }): OpsDeps; log(line: string): void }): Promise<number>` returning the exit code. Flags: none (seed), `--dry-run` (validate, query, print what would be created or skipped, no writes), `--keepalive` (one keepalive run). Unknown flags print usage and return 2. Missing or invalid env returns 1 and logs `readOfficialEnv`'s reason (variable names only).
- `scripts/seed-official.ts` is thin: top level `process.exit(await runSeedCli(process.argv.slice(2), process.env, { makeOps: c => buildOps(c.privateKey, c.rpcUrl), log: line => console.log(line) }))`.
- `instrumentation.ts`: `export async function register()` that returns early unless `process.env.NEXT_RUNTIME === 'nodejs'`, then `const { startKeepaliveFromEnv } = await import('./lib/dash/server/keepalive')` and calls it. Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md` and `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md` first. `register` must not await the timer.

Behaviour:
- `seedOfficial(deps, defs = OFFICIAL_DASHBOARDS)`: validate every definition first (slug regex, unique slugs, `parseDashboardPayload`, `parseWidgetPayload`, at most 48 widgets); any failure throws an `Error` naming the slug before any RPC call. Then for each definition, in order, one `deps.queue.run` job: `queryAll(deps.reader, officialExpr(deps.wallet))`; if a live (`expiresAt > head`) entity parses with `asDashboard` as official with that slug, record it in `skipped`; otherwise `predictEntityKeys({ owner, count: 1 + 2 * n })` and one `executeBatch({ creates })` in key order: the dashboard (`type`, `project`, `user = addr(wallet)`, `login = 'arkiv'`, `title`, `slug`; payload `{ v: 1, title, description }`), then the n widgets (`type`, `project`, `user`, `login = 'arkiv'`, `name`, `chart`; payload the parsed widget), then the n links (`type`, `project`, `user`, `dashboard = key(dashboardKey)`, `widget = key(widgetKey)`; payload `{ v: 1, size, position: i, name }`). Every create uses `ExpirationTime.fromSeconds(90 * 86400)` and the predicted `salt`, following the `createWidget` batch pattern in `operations.ts`. Reads go through the existing `read` wrapper and writes through `write`.
- `keepOfficialAlive(deps, { keepDays = OFFICIAL_KEEP_DAYS } = {})`: one queue job; `queryAll(officialExpr(wallet))`; consider live entities whose `creator` is the wallet, `attrs.project` is the project and `attrs.user` equals the wallet; extend those with `expiresAt < head + keepDays * BLOCKS_PER_DAY` to `head + MAX_REMAINING_DAYS * BLOCKS_PER_DAY` with `ExpirationTime.atBlock`, in `executeBatch({ extensions })` chunks of 50. Returns `{ checked, extended, txHashes }`; when nothing is due it sends no write.
- `startOfficialKeepalive`: schedules `run` after `firstDelayMs` (default 60,000) and then every `intervalMs` (default 21,600,000) using the injected `setTimer` (default `setTimeout`, handle `unref()` when available). A rejected `run` logs `Official keepalive failed: <error message>` and the next run is still scheduled. `stop()` cancels the pending timer. Runs never overlap (the next timer is set after a run settles).
- `startKeepaliveFromEnv`: returns at once when `globalThis.__officialKeepalive` is set, when `process.env.NEXT_PHASE === 'phase-production-build'`, or when `getDashDeps()` is disabled; otherwise sets the guard and starts the timer with `run = () => keepOfficialAlive(deps.ops)` and logs one line per run that extended something (`Official keepalive extended N entities`).

- [ ] **Step 1: Write the failing tests** (`dash-official-ops.test.ts`, fakes from `dash-fakes.ts`)
  - Seed on an empty fake chain: one `predictEntityKeys` call per definition with `count` `1 + 2n`, one `executeBatch` per definition whose creates are dashboard, widgets, links in that order; the dashboard create has attributes `user` (addr of the wallet), `login: 'arkiv'`, `slug`; each link's `dashboard` and `widget` attributes are the predicted keys; link payload positions are `0..n-1`; all four slugs are in `created`.
  - Seed again on a chain that already holds a live official dashboard with slug `creators`: `skipped` is `['creators']` and no `predictEntityKeys` or `executeBatch` happens for it. A dashboard with that slug but `user = U` does not count as existing. An expired official dashboard with that slug does not count either.
  - Seed with a definition whose widget SQL is `DELETE FROM x` throws before any reader or client call.
  - Seed jobs go through the queue: with a queue whose `run` is spied, the spy is called once per definition.
  - Keepalive with head 1,000,000 and official entities expiring at head plus 10 days, head plus 60 days, and an already expired one, plus a user widget expiring at head plus 1 day: one `executeBatch` with exactly one extension, for the 10 day entity, target `1,000,000 + 90 * 43200`; result `{ checked: 2, extended: 1 }`. Running it again on the updated fake chain sends no write and returns `extended: 0`. 120 due entities produce three batches (50, 50, 20).
  - `startOfficialKeepalive` with a fake `setTimer` that records `(fn, ms)`: first delay 60,000; after the run settles the next delay is 21,600,000; a rejecting `run` logs a line starting `Official keepalive failed:` and still schedules the next run; `stop()` prevents further runs.
  - `startKeepaliveFromEnv` with `NEXT_PHASE=phase-production-build` starts nothing (assert through an injected or spied scheduler, or by checking the global guard stays unset).
  - `runSeedCli([], {}, io)` returns 1 and logs a line containing `DASHBOARD_PRIVATE_KEY` but no hex key; `runSeedCli(['--bogus'], env, io)` returns 2; `--dry-run` with fake ops performs zero client calls and logs one line per slug with `would create` or `exists`; `--keepalive` calls `keepOfficialAlive` once. No logged line contains the private key value.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-official-ops.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** per the behaviour above. `buildOps(privateKey, rpcUrl)` holds the client construction now inside `buildDashDeps` (wallet client, public client with `predictEntityKeys`, `createRpc` reader, `new WriteQueue(25)`), and `buildDashDeps` calls it. `readOfficialEnv` requires `DASHBOARD_PRIVATE_KEY` (32 byte hex) and takes `NEXT_PUBLIC_TIRAMISU_RPC_URL` or the default Tiramisu URL; it never needs Privy variables. DEVELOPER.md: a section "Official dashboards" covering the seed commands, `--dry-run`, `--keepalive`, the nonce caveat, and the in process keepalive (60 seconds after start, then every 6 hours, extends when under 30 days). CHANGELOG line: "Seed script and in process keepalive for official dashboards."

- [ ] **Step 4: Verify.** Run `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: 0 fail, clean type check.

- [ ] **Step 5: Commit (coordinator)**

```bash
git commit -m "feat(web): idempotent official dashboard seed and in process keepalive through the write queue"
```

### Task 5: `/explore` with Dashboards and Widgets tabs; `/widgets` redirect

**Files:**
- Create: `apps/web/app/explore/page.tsx`, `apps/web/app/explore/layout.tsx`, `apps/web/components/explore/ExplorePage.tsx`, `apps/web/components/explore/DashboardBrowse.tsx`, `apps/web/components/explore/DashboardBrowseCard.tsx`, `apps/web/components/explore/explore.module.css`, `apps/web/lib/dash/explore-tabs.ts`, `apps/web/lib/dash/dashboard-browse-state.ts`, `apps/web/test/dash-explore.test.tsx`
- Modify: `apps/web/app/widgets/page.tsx` (redirect), `apps/web/lib/dash/sql.ts`, `apps/web/lib/dash/read.ts`, `apps/web/components/widgets/ExplorerGrid.tsx`, `apps/web/components/widgets/WidgetBrowseCard.tsx`, every `href="/widgets"` link (search the repo: `DashboardView.tsx`, `WidgetPage.tsx`, `HomePage.tsx` and others), `apps/web/test/dash-explorer.test.tsx`, `apps/web/test/dash-browse.test.tsx`, `CHANGELOG.md`

**Why:** Owner decision 7, UI §10.6. The nav already points at `/explore` (Task 1).

**Interfaces:**
- Produces CONTEXT §11.5 `DashboardListQuery`, `DashboardListItem`, `dashboardListSql`, `dashboardCountSql`, `toDashboardItems`, `fetchDashboards`.
- `explore-tabs.ts`: `export type ExploreTab = 'dashboards' | 'widgets'`; `tabFromSearch(search: string | URLSearchParams): ExploreTab` (anything but `widgets` is `dashboards`); `searchForTab(current: string, tab: ExploreTab): string` (leading `?` or empty; drops `tab` for `dashboards`; keeps other parameters); `tabAfterKey(tab: ExploreTab, key: string): ExploreTab` (ArrowLeft, ArrowRight, Home, End; other keys return `tab`).
- `dashboard-browse-state.ts`: `DashboardBrowseState = { search: string; sort: 'newest' | 'widgets' | 'expiring'; official: boolean; pages: number }`, `initDashboardBrowse()`, `dashboardBrowseReducer(s, a)` with actions `search`, `sort`, `official`, `more`, `clear` (filters reset `pages` to 1), `dashboardBrowseQuery(s): DashboardListQuery` (limit `12 * pages`, offset 0), `resultsLine(total: number, s: DashboardBrowseState): string`.
- `DashboardBrowseCard({ item, head, description }: { item: DashboardListItem; head?: number; description?: string })` per UI §10.5.
- `DashboardBrowseView(props: { state; dispatch; items: DashboardListItem[]; total: number | null; loading: boolean; error?: string; head?: number; descriptions?: Map<string, string> })` presentational; `DashboardBrowse()` container.
- `ExplorePage()` reads `?tab=` with `useSearchParams` (wrap in `Suspense` in the page) and replaces the URL with `window.history.replaceState` on tab change.
- `WidgetBrowseCard` gains `official?: boolean` (Official chip in the byline, "Kept live" instead of `TimeLeft`, no Extend). `ExplorerView` loses its h1 and gains the `.btn-primary` "+ New widget" at the end of the controls row; `ExplorerGrid` passes `official={item.user === config.wallet}`.
- `app/widgets/page.tsx` becomes a server component that calls `redirect('/explore?tab=widgets')` from `next/navigation` (read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`). `app/widgets/layout.tsx` stays for the child routes.

SQL: `dashboardListSql` starts from `dashCte`, selects dashboards with `count(DISTINCT l.key)` live links as `widgets`, `list(DISTINCT w.chart ORDER BY w.chart)` of live linked widgets as `charts` (filter out nulls), `d.usr = <wallet>` as `official`; search matches `lower(title)` with the same escaping as `widgetFilters` and a hex prefix on `usr`; `official: true` adds `d.usr = <wallet>`; order `newest` created desc, `oldest` created asc, `widgets` count desc, `expiring` expires asc, then key. Validate limit and offset like `widgetListSql`.

- [ ] **Step 1: Write the failing tests** (`dash-explore.test.tsx`; DuckDB through `nativeDb` from `dash-duckdb.ts`)
  - Seed four dashboards (one official with `usr` = wallet, three users), links to widgets of charts `bar`, `donut`, `bar`, and one foreign creator dashboard: `newest`, `oldest`, `widgets`, `expiring` orders are right; `official: true` returns only the official one; `charts` for a dashboard with two bar widgets and one donut is `['bar', 'donut']`; search `over` matches `Overview` case insensitively; search `%` matches only a title containing `%`; search `x' OR '1'='1` returns nothing and does not throw; the foreign dashboard never appears; `dashboardCountSql` agrees with the unpaged list length; `toDashboardItems` lowercases keys and converts numbers and the official flag to booleans.
  - `tabFromSearch('?tab=widgets')` is `widgets`, `tabFromSearch('')` and `tabFromSearch('?tab=x')` are `dashboards`; `searchForTab('?q=a', 'widgets')` is `?q=a&tab=widgets`; `searchForTab('?tab=widgets', 'dashboards')` is empty; `tabAfterKey('dashboards', 'ArrowRight')` is `widgets`, `tabAfterKey('widgets', 'Home')` is `dashboards`.
  - `dashboardBrowseReducer`: `search`, `sort` and `official` reset `pages` to 1; `more` increments it; `clear` restores defaults. `resultsLine(38, init)` is `38 dashboards, newest first`; `resultsLine(1, { …, sort: 'widgets' })` is `1 dashboard, most widgets first`; with `official: true` and `expiring`, `5 official dashboards, expiring soonest first`.
  - Static render of `DashboardBrowseCard` for an official item: contains `Official`, `Arkiv SQL Indexer`, `Kept live`, `href="/d/<key>"`, one `ChartIcon` per chart, and `8 widgets` (`1 widget` singular); for a user item: a short address and a `TimeLeft` chip, no `Official`; an item with no charts shows `No widgets yet`.
  - Static render of `ExplorePage` content (render the presentational parts with an injected tab): `role="tablist"` with `aria-label="Explore"`, two tabs `Dashboards` and `Widgets`, the selected tab has `aria-selected="true"` and `tabindex="0"`, the other `tabindex="-1"`; h1 `Explore`.
  - `ExplorerView` markup has no `<h1` and contains `+ New widget` linking `/widgets/new`. `WidgetBrowseCard` with `official` shows `Official` and `Kept live` and no `Extend`.
  - `app/widgets/page.tsx` source (read as text) calls `redirect('/explore?tab=widgets')`. No file under `apps/web/components` or `apps/web/app` contains `href="/widgets"` or `href='/widgets'` (exact, not `/widgets/`).

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-explore.test.tsx` and the touched files. Expected: FAIL.

- [ ] **Step 3: Implement** per UI §10.6. The Dashboards tab loads pages of 12 like the widget explorer, fetches descriptions for the visible keys with one `fetchDashboards` call per page (show cards without descriptions until it resolves; an RPC error leaves descriptions out silently and logs nothing to the UI). Use `showLoading` for loading states. Tab counts come from `dashboardCountSql` and `widgetCountSql` with empty filters. Links that said "Browse widgets" now go to `/explore?tab=widgets`. Metadata in `app/explore/layout.tsx`: title `Explore · Arkiv SQL`, description `Public dashboards and widgets over live Arkiv data`. CHANGELOG line: "Explore page with Dashboards and Widgets tabs; /widgets redirects to the Widgets tab."

- [ ] **Step 4: Verify.** Run `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: 0 fail, clean type check.

- [ ] **Step 5: Commit (coordinator)**

```bash
git commit -m "feat(web): explore page with dashboards and widgets tabs, widgets route redirects to it"
```

### Task 6: Landing page with Official dashboards; remove the showcase

**Files:**
- Create: `apps/web/components/landing/OfficialDashboards.tsx`
- Modify: `apps/web/components/landing/Home.tsx`, `apps/web/components/dash/Hero.tsx`, `apps/web/components/landing/landing.module.css`, `apps/web/components/landing/Story.tsx`, `apps/web/components/about/content.tsx` and `apps/web/app/about/page.tsx` (showcase links and copy), `apps/web/app/showcase/page.tsx` (redirect), `apps/web/components/dash/WidgetCard.tsx` (remove the `WidgetCard` component, keep `WidgetBody`, `StatBody`, `playgroundHref`), `apps/web/test/landing.test.tsx`, `apps/web/test/showcase.test.tsx`, `README.md`, `SPECS.md`, `DEVELOPER.md`, `CHANGELOG.md`
- Delete: `apps/web/components/landing/PreviewCards.tsx`, `apps/web/components/dash/ShowcaseGallery.tsx`, `apps/web/components/dash/ViewTabs.tsx`, `apps/web/components/showcase/ShowcaseSection.tsx`, `apps/web/components/showcase/LiveToggle.tsx`, `apps/web/components/showcase/use-live-mode.ts`, `apps/web/components/showcase/view-state.ts`, `apps/web/components/showcase/layout.ts` (if nothing else imports it), `apps/web/app/showcase/layout.tsx`, `apps/web/test/live-mode.test.ts`
- Keep: `apps/web/components/showcase/showcase.module.css` (dashboard and widget cards still use it) and `apps/web/lib/views.ts` (playground snippets and official definitions use it).

**Why:** Owner decision 2, UI §10.5. Official dashboards are the landing content now.

**Interfaces:**
- `OfficialDashboardsView(props: { enabled: boolean; items: DashboardListItem[] | null; descriptions?: Map<string, string>; head?: number; error?: string }): JSX.Element | null` (null when not enabled; `items === null` means loading).
- `OfficialDashboards()` container: `useDashAuth().config`, `useIndex()`, `useTimedQuery(dashboardListSql(wallet, { search: '', sort: 'oldest', official: true, limit: 6, offset: 0 }), version, { skip: !enabled })`, then one `fetchDashboards` for the descriptions.
- `Hero` copy and CTAs per UI §10.5; the "Build your dashboard" text link uses `useDashAuth().requestLogin()` when logged out and links to `/me` when logged in (render it as a `Link` to `/me` with an `onClick` that starts login when anonymous, so it works without JavaScript too).
- `app/showcase/page.tsx` becomes a server component calling `redirect('/explore')`.

- [ ] **Step 1: Write the failing tests**
  - `OfficialDashboardsView` with `enabled: false` renders nothing (empty string). With `items: null` it renders three skeleton cards with `aria-busy="true"` on the grid. With two items it renders the heading `Official dashboards`, the sub line from UI §10.5, `All dashboards` linking `/explore`, two `DashboardBrowseCard`s in the given order, and the description for the first item when present in `descriptions`. With `items: []` it renders `Official dashboards are not set up on this deployment yet.` and a link `Explore community dashboards` to `/explore`.
  - Hero markup: title `Explore live Arkiv data, in SQL.`, `Explore dashboards` linking `/explore`, `Open playground` linking `/playground`, `Build your dashboard`, and no `/showcase` anywhere.
  - `Home` source and markup: no `PreviewCards`; `OfficialDashboards` is rendered between the hero and the activity feed (assert by import presence and render order in the static markup with a stubbed config).
  - `app/showcase/page.tsx` source calls `redirect('/explore')`. No file under `apps/web/app`, `apps/web/components` or `apps/web/lib` contains a route string `/showcase` (regex `["'`]/showcase`, so relative imports such as `'../showcase/showcase.module.css'` do not count) except that redirect. The remaining `showcase.test.tsx` case for stat cards renders `StatBody` directly (the `WidgetCard` footer case is removed with the component); `live-mode.test.ts` is deleted with its module.
  - README, SPECS.md and DEVELOPER.md contain no `/showcase` route and mention `/explore` and "Official dashboards" (extend the existing docs test in `test/deployment.test.ts` only if needed; keep its dash rule passing).

- [ ] **Step 2: Run** the touched test files. Expected: FAIL.

- [ ] **Step 3: Implement** per UI §10.5. Keep the four live figures and the pipeline strip (restyle the figure grid with the bordered tiles of the mock). About page: "Open the showcase" becomes "Explore dashboards" to `/explore`; the query figure caption says "The Top 10 creators chart on the Creators official dashboard."; the reproduce steps point at `/explore` and the Creators official dashboard instead of `/showcase` and `/showcase?view=creators`. Story chapter links that pointed at the showcase point at `/explore`. Docs: README pages list (`/`, `/explore`, `/playground`, `/about`, `/me`, `/d/<key>`, `/widgets/<key>`, `/widgets/new`), the "open the showcase" quick start step becomes opening an Official dashboard from the landing page; SPECS.md goal 4 and section 9.1 describe Official dashboards (owner decision, 20 October 2026) instead of the showcase; DEVELOPER.md module table drops "showcase". CHANGELOG line: "Landing shows Official dashboards; the showcase page is removed and redirects to Explore."

- [ ] **Step 4: Verify.** Run `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: 0 fail, clean type check.

- [ ] **Step 5: Commit (coordinator)**

```bash
git commit -m "feat(web): landing shows official dashboards and the showcase is removed"
```

### Task 7: Report style dashboard view, share menu, hover actions, faint borders

**Files:**
- Create: `apps/web/lib/dash/report.ts`, `apps/web/components/widgets/ShareMenu.tsx`, `apps/web/components/widgets/report.module.css`, `apps/web/test/dash-report.test.tsx`
- Modify: `apps/web/components/widgets/DashboardView.tsx`, `apps/web/components/widgets/SavedWidgetCard.tsx`, `apps/web/test/dash-view.test.tsx`, `apps/web/test/dash-saved-card.test.tsx`, `CHANGELOG.md`

**Why:** Owner decision 1, UI §10.7 and §10.8.

**Interfaces:**
- `lib/dash/report.ts` (pure):

```ts
export function figureNumbers(slots: { id: string; status: SlotStatus; chart: ChartType | null }[]): Map<string, number>   // 1.. over live slots whose chart is not 'counter', in order
export function shareUrls(origin: string, key: string, title: string): { link: string; x: string }
// link = `${origin}/d/${key}`; x = `https://x.com/intent/post?text=${encodeURIComponent(`${title}, a live report on Arkiv SQL Indexer`)}&url=${encodeURIComponent(link)}`
export function menuIndex(key: string, index: number, count: number): number | 'close' | null   // ArrowDown, ArrowUp (wrap), Home, End, Escape -> 'close', else null
export function updatedLabel(updatedAt: number, head: number): string   // `Updated ${blockAge(updatedAt, head)} ago`
export function importedFrom(widgetUser: string, dashboardUser: string, wallet: string): string | null   // null when equal; 'Imported from Arkiv SQL Indexer' for an official widget; else `Imported from ${shortHex(widgetUser)}`
```

- `ShareMenu({ title, dashboardKey, initialOpen }: { title: string; dashboardKey: string; initialOpen?: boolean })`.
- `DashboardView` exports `ReportHeader(props: { title: string; description: string; user: string; official: boolean; count: number; owner: boolean; dashboardKey: string; updatedAt: number; head: number })` replacing `DashboardHeader` (update its tests), and keeps `EmptyDashboard`, `MissingDashboard`, `DashboardView`.
- `SavedWidgetCard` keeps every current prop and adds `figure?: number`, `subtitle?: string | null`, `official?: boolean`, `initialActionsOpen?: boolean`.

- [ ] **Step 1: Write the failing tests** (`dash-report.test.tsx`, updates to `dash-view.test.tsx` and `dash-saved-card.test.tsx`)
  - `figureNumbers` over slots `[counter live, bar live, counter live, donut expired, table live]` gives `{ bar: 1, table: 2 }` and no entry for counters or the expired slot.
  - `shareUrls('https://a.b', '0xk', 'Expiry watch')` gives link `https://a.b/d/0xk` and x `https://x.com/intent/post?text=Expiry%20watch%2C%20a%20live%20report%20on%20Arkiv%20SQL%20Indexer&url=https%3A%2F%2Fa.b%2Fd%2F0xk`.
  - `menuIndex('ArrowDown', 1, 2)` 0, `menuIndex('ArrowUp', 0, 2)` 1, `menuIndex('End', 0, 2)` 1, `menuIndex('Escape', 0, 2)` `'close'`, `menuIndex('a', 0, 2)` null.
  - `importedFrom(U, U, W)` null; `importedFrom(W, U, W)` `Imported from Arkiv SQL Indexer`; `importedFrom(OTHER, U, W)` starts `Imported from 0x`.
  - `ShareMenu` closed: a button with `aria-label="Share dashboard"`, `aria-haspopup="menu"`, `aria-expanded="false"`, and the menu has the `hidden` attribute. With `initialOpen`: `aria-expanded="true"`, `role="menu"` with two `role="menuitem"` entries `Copy link` and `Post on X`, the X entry has the exact `shareUrls` href, `target="_blank"` and `rel="noopener noreferrer"`.
  - `ReportHeader` official: breadcrumb links `/explore` and `/explore?tab=dashboards`, eyebrow `Official` and `Network report`, `By` and `Arkiv SQL Indexer`, `8 widgets`, `Live, computed in your browser`, the `updatedLabel` text, an `<h1` with the title, the description; no `Organize dashboard`. User dashboard owned by the viewer: eyebrow `Dashboard`, toolbar with `role="toolbar"` and `aria-label="Dashboard actions"` containing links labelled `Organize dashboard` (`/d/<key>/edit`) and `Add widgets` (`/d/<key>/edit?import=1`) and the share button; no `.btn-primary` inside the header. A blank description renders no description paragraph.
  - `SavedWidgetCard` live with `figure: 2`: markup contains `Figure 2`, the name, the actions bar with `View SQL for <name>`, `Open widget <name>` linking `/widgets/<key>`, a `TimeLeft` chip, and an overflow button `Actions for <name>` with `aria-expanded="false"`; with `official` the chip reads `Kept live`; a counter card shows no `Figure` eyebrow; `subtitle` renders under the name. The card root uses the report figure class and keeps the existing `--lg`, `--md`, `--sm` values (existing span tests unchanged).
  - `report.module.css` read as text: the figure rule contains `border:1px solid var(--border-faint)` and `border-radius:4px` and no `box-shadow` other than `none`; the actions rule contains `opacity:0` and `pointer-events:none`; there is a `:focus-within` rule that sets `opacity:1`; there is an `@media (hover:none)` rule; the file contains no `display:none` for the actions bar outside the `hover:none` media query.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-report.test.tsx ./apps/web/test/dash-view.test.tsx ./apps/web/test/dash-saved-card.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** per UI §10.7. Share menu behaviour: open with click, Enter or Space and focus the first item; `menuIndex` drives arrow keys; Escape and outside clicks close and refocus the button; Copy link writes `shareUrls(...).link` to the clipboard, shows `✓ Link copied` for 2 seconds in the item and announces it through an `aria-live="polite"` span; clipboard failure leaves the text unchanged. Figure actions: hover and `:focus-within` reveal; the overflow button toggles per card state and Escape inside the card closes it and refocuses the button. `DashboardView` computes `figureNumbers` from the slots (chart from `slot.widget?.chart ?? null`), passes `subtitle = importedFrom(widget.user, dashboard.user, wallet)` and `official = widget.official`. Owner is never true for an official dashboard (its `user` is the wallet). Phone spans per UI §10.7. Keep the existing empty, missing and error copy. CHANGELOG line: "Dashboards read like reports: numbered figures, quiet icon actions, share menu with Copy link and Post on X."

- [ ] **Step 4: Verify.** Run `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: 0 fail, clean type check.

- [ ] **Step 5: Commit (coordinator)**

```bash
git commit -m "feat(web): report style dashboard view with share menu and hover or focus widget actions"
```

### Task 8: Widget page and the remaining pages in the new theme

**Files:**
- Modify: `apps/web/components/widgets/WidgetPage.tsx`, `apps/web/lib/dash/sql.ts` (`widgetDashboardsSql`), `apps/web/components/widgets/HomePage.tsx`, `apps/web/components/widgets/DashboardCard.tsx`, `apps/web/components/widgets/WidgetEditor.tsx`, `apps/web/components/widgets/WidgetSettings.tsx`, `apps/web/components/widgets/OrganizeBoard.tsx`, `apps/web/components/widgets/OrganizeRow.tsx`, `apps/web/components/widgets/ImportModal.tsx`, `apps/web/components/widgets/AddToDashboardPicker.tsx`, `apps/web/components/widgets/LoginGate.tsx`, `apps/web/components/widgets/ExtendDialog.tsx`, `apps/web/components/widgets/widgets.module.css`, `apps/web/components/widgets/organize.module.css`, `apps/web/components/showcase/showcase.module.css`, `apps/web/components/playground/playground.module.css`, `apps/web/components/about/about.module.css`, `apps/web/app/globals.css`, `apps/web/test/dash-widget-page.test.tsx`, `apps/web/test/dash-home.test.tsx`, `CHANGELOG.md`, `SPECS.md`
- Create: `apps/web/test/theme-sweep.test.ts`

**Why:** Owner decision 1 for the pages not covered by Tasks 1 to 7 (UI §10.12), plus the official widget rules (UI §10.8).

**Interfaces:**
- `widgetDashboardsSql(wallet: string, widgetKey: string, limit: number): string` returning `key, title, usr, widgets` for live dashboards that hold a live link to the widget, ordered official first (`usr = wallet`), then by title and key; and `toUsedOn(rows: unknown[][], wallet: string): { key: string; title: string; user: string; official: boolean; widgets: number }[]`.
- `WidgetPage` keeps its export and props. New presentational pieces exported for tests: `WidgetHeader(props: { name: string; chart: ChartType; user: string; official: boolean; uses: number; expiresAt: number; head?: number; ms?: number; widgetKey: string; sql: string; canAdd: boolean })`, `UsedOnPanel(props: { items: ReturnType<typeof toUsedOn>; total: number; expanded?: boolean })`, `LifetimePanel(props: { official: boolean; expiresAt: number; head?: number; lifetimeDays: LifetimeDays; widgetKey: string; canExtend: boolean; reason?: string })`.

- [ ] **Step 1: Write the failing tests**
  - `widgetDashboardsSql` with `nativeDb`: three dashboards link the widget (one official), one link is expired, one dashboard belongs to a foreign creator: returns the two live dashboards of the wallet plus the official one first; `limit 2` returns two rows; `toUsedOn` sets `official` and lowercases keys.
  - `WidgetHeader` for a non owner: breadcrumb `Explore` (`/explore`) and `Widgets` (`/explore?tab=widgets`), an `<h1` with the name, the chart chip label from `CHART_LABELS`, `on 12 dashboards`, `Live, computed in your browser`, buttons `Copy link`, `Open in playground` (href from `playgroundHref(sql)`), `+ Add to dashboard` as `.btn-primary`. Official: `Arkiv SQL Indexer` and `Kept live`.
  - `UsedOnPanel` with 6 items and `total: 6` shows `Used on 6 dashboards`, four rows linking `/d/<key>` and a `Show all 6` button; with `expanded` it shows six rows; an official row carries the `Official` chip.
  - `LifetimePanel` official: `Kept live` and no `Extend`; user widget with `canExtend`: `Extend by 7 days` (from `lifetimeDays`), the eligibility note, and `Lives for 7 days per extend`.
  - Existing widget page tests (owner editor, expired copy, non owner read only) still pass with the new markup.
  - `DashboardCard` on `/me` takes its card styles from `components/explore/explore.module.css` like `DashboardBrowseCard` (assert by reading its source) and its markup keeps the `4 widgets · edited 2h ago` style meta and the Syncing chip.
  - `theme-sweep.test.ts`: no `.tsx` or `.css` file under `apps/web/components` or `apps/web/app` contains a hex color literal (`/#[0-9a-fA-F]{3,8}\b/` outside comments) or `rgba(`, except `apps/web/app/theme.css` (the token source) and `apps/web/app/layout.tsx` (the `themeColor` values); every `.css` file under `apps/web/components` and `apps/web/app/globals.css` uses only custom properties that exist: collect `var(--name)` uses in each `.css` file and check each name appears as `--name:` in `theme.css` or in the same file, or is one of the inline layout variables `--lg`, `--md`, `--sm`, `--span` that components set through `style`. (Local layout variables such as `--pad`, `--side-w` and `--top-h` already pass because their files define them.) Today `components/landing/landing.module.css` and `components/playground/playground.module.css` hold literals; replace them with tokens or `color-mix(in srgb, var(--token) N%, transparent)`.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-widget-page.test.tsx ./apps/web/test/dash-home.test.tsx ./apps/web/test/theme-sweep.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the widget page per UI §10.12 (two column layout, 340px aside, stacked under 1100px; Chart and Table segment with `aria-pressed`; read only SQL `pre` with `tabindex="0"` and "Copy SQL"). The owner view keeps the editor of UI §4 under the new header. Sweep every listed module to the new tokens, buttons (`.btn`, `.btn-primary`, `.btn-outline`, `.btn-quiet`, `.ib`), chips, inputs (`--inset` fill, `--ui-edge` border, 34px or more), dialogs and popovers (`--card`, `--border-strong`, `--shadow-pop`, `--r-lg`) and focus rings. Hide Extend for official widgets everywhere (`HomePage` never lists official widgets because they are not the viewer's; `OrganizeRow` hides Extend for an official widget and shows `Kept live`). Copy stays as in UI §2 to §9. SPECS.md: a short section "Theme and shell" recording the owner decisions of 20 October 2026 (console theme, light mode, navbar, status bar everywhere, report view, share menu, chart types, no time ranges, Explore tabs, Official dashboards with keepalive), without dashes as punctuation. CHANGELOG line: "Widget page and remaining pages restyled; official widgets show Kept live instead of Extend."

- [ ] **Step 4: Verify.** Run `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: 0 fail, clean type check.

- [ ] **Step 5: Commit (coordinator)**

```bash
git commit -m "feat(web): widget page and remaining pages in the console theme"
```
