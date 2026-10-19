# Widget dashboards plan 4: widget explorer, home and docs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Required Reading

1. `docs/superpowers/plans/2026-10-20-widget-dashboards/CONTEXT.md` (all sections).
2. Interfaces blocks of `02-login-and-widgets.md` and `03-dashboards.md`.
3. UI doc `docs/superpowers/specs/2026-10-20-widget-dashboards-ui.md` sections 0, 1, 3, 5 and 9.
4. Spec sections 2, 8, 9.2 and 9.6.
5. Existing docs: `README.md`, `SPECS.md`, `DEVELOPER.md`, `CHANGELOG.md`, `arkiv/schema.md`, `test/deployment.test.ts` (dash punctuation check), `apps/web/test/landing.test.tsx` (`NAV_ITEMS` assertion).

**Goal:** A public widget explorer at `/widgets`, a logged in home at `/me` with dashboards, widgets and activity, the "Widgets" nav item, and up to date project docs for the feature.

**Architecture:** Both pages read lists and counts from local DuckDB through new builders in `lib/dash/sql.ts` (always creator and project scoped), fetch widget payloads only where needed (previews, lifetimes for Extend) in batched RPC queries, and merge pending writes so new entities show before the index catches up. Docs describe the three entity types, the write path, the new environment variables and the self hosting expression rule.

**Tech Stack:** Next.js 16 client pages, DuckDB WASM via `IndexDb`, Bun test with native DuckDB for SQL checks.

**Spec:** `docs/superpowers/specs/2026-10-20-widget-dashboards-design.md`

## Global Constraints

- CONTEXT.md sections 2, 6, 9 and 10 apply.
- Explorer: "search by name or creator address; chart type filter; sort by Newest, Most used, Expiring soon; "Mine only" toggle when logged in." and "one batched `$key` query per page of 12, and render only when a card scrolls into view" (spec §9.6).
- Home activity: "counters for live widgets, live dashboards, total dashboard placements of the user's widgets (links by other users count too), and active days (distinct days with a created or updated entity); an "Expiring soon" list; a recent list of the user's entities by updated time with entity links. Source: local DuckDB over `entities` and `attributes`, filtered by the `user` attribute and `creator = <dashboard wallet>`." and "no tx hashes" (spec §9.2).
- "the README must tell them to include the dashboard wallet with `OR` (the documented query grammar, SPECS.md section 4) if they use the widget features" (spec §8), plus the re-index note (spec §8).
- Docs use no dashes as punctuation; `test/deployment.test.ts` must pass.

## Review Focus

1. Search input with quotes, `%`, `_` or a pasted full address must neither break the SQL nor over match. Covered by plan 3 Task 4 tests for the shared builder; this plan adds the explorer state test that the raw input reaches `widgetListSql` unmodified (Task 1).
2. "Active days" must count distinct days across both creation and update blocks of the user's widgets and dashboards, not entities; an entity created and updated on the same day counts once. Pinned in Task 2.
3. Placements must count links by any user that point at the user's widgets, and only live links. Pinned in Task 2.
4. A user who just created a dashboard must see it on `/me` before the index has it (pending write merge), and it must not appear twice once indexed. Pinned in Task 3 (`mergeDashboards`).
5. The README expression example must be copy paste valid for Compose (single quoted, `OR` of two `$creator` terms with lowercase addresses). Pinned in Task 4 (deployment test assertion).

---

### Task 1: "Widgets" nav item and the explorer `/widgets`

**Files:**
- Modify: `apps/web/components/dash/TopBar.tsx` (`NAV_ITEMS` gains `{ href: '/widgets', label: 'Widgets' }` after Playground), `apps/web/test/landing.test.tsx` (expected hrefs)
- Create: `apps/web/app/widgets/page.tsx`, `apps/web/components/widgets/ExplorerGrid.tsx`, `apps/web/lib/dash/explorer-state.ts`
- Test: `apps/web/test/dash-explorer.test.tsx`

**Interfaces:**
- Consumes: `useWidgetList`, `widgetCountSql`, `WidgetBrowseCard`, `AddToDashboardPicker`, `useDashAuth`, `ChartIcon`.
- Produces:

```ts
export type ExplorerState = { search: string; chart: ChartType | null; sort: 'newest' | 'used' | 'expiring'; mine: boolean; pages: number }
export function initExplorer(): ExplorerState                         // '', null, 'newest', false, 1
export function explorerReducer(s: ExplorerState, a: { type: 'search'; value: string } | { type: 'chart'; value: ChartType | null } | { type: 'sort'; value: ExplorerState['sort'] }
  | { type: 'mine'; value: boolean } | { type: 'more' } | { type: 'clear' }): ExplorerState
export function explorerQuery(s: ExplorerState, address: string | undefined): WidgetListQuery   // limit 12 * pages, offset 0; user = address only when mine and logged in
export function ExplorerGrid(props: { state: ExplorerState; dispatch(a: Parameters<typeof explorerReducer>[1]): void }): JSX.Element
```

- [ ] **Step 1: Write the failing tests:** update `landing.test.tsx` to expect `['/', '/showcase', '/playground', '/widgets', '/about']`; reducer: filters reset `pages` to 1, `more` increments, `clear` restores everything except `mine`; `explorerQuery` passes the raw search text (`x' OR %_`) unchanged, sets `user` only when `mine` and an address exists, and `limit` 24 after one `more`; static renders: the no widgets state and the no match state with `Clear filters` use UI §5 copy verbatim; the header shows `+ New widget` linking to `/widgets/new` and the live count chip text `214 live` when given 214; the `Mine only` checkbox renders only when logged in.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-explorer.test.tsx ./apps/web/test/landing.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** per UI §5. Search input is debounced 250 ms before dispatch. "+ Add to dashboard" on a card opens `AddToDashboardPicker` (logged out: `requestLogin` first). Pending widget upserts from this browser appear at the top of the Newest sort until synced (use `usePending` and the pending `fields`); do not duplicate a key that the list already has.

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/components/dash/TopBar.tsx apps/web/test/landing.test.tsx apps/web/app/widgets/page.tsx apps/web/components/widgets/ExplorerGrid.tsx apps/web/lib/dash/explorer-state.ts apps/web/test/dash-explorer.test.tsx
git commit -m "feat(web): public widget explorer with search, filters and sort"
```

### Task 2: Home and activity SQL

**Files:**
- Modify: `apps/web/lib/dash/sql.ts`
- Test: `apps/web/test/dash-home-sql.test.ts`

**Interfaces:**
- Consumes: `dashCte`, `nativeDb` test helper (plan 2).
- Produces:

```ts
export function myDashboardsSql(wallet: string, user: string): string     // key, title, widgets, updated_at; newest updated first
export function myWidgetsSql(wallet: string, user: string): string        // key, name, chart, expires_at, updated_at; soonest expiry first
export function activityCountsSql(wallet: string, user: string): string   // one row: live_widgets, live_dashboards, placements, active_days
export function expiringSoonSql(wallet: string, user: string): string     // key, type, label, expires_at for the user's widgets and dashboards with expires_at <= live_head + 43200; soonest first, limit 10
export function recentSql(wallet: string, user: string): string           // key, type, label, kind ('Created' when created_at = updated_at else 'Patched'), updated_at; newest first, limit 10
```

- [ ] **Step 1: Write the failing tests** against `nativeDb` with a `live_head` table (`block` = 100000) and rows for user U: two widgets (one created and updated on the same day, one updated two days later), one dashboard, links from U's dashboard and from another user's dashboard pointing at U's widgets, one link pointing at a foreign widget, and one widget by another creator carrying `user = U`. Assert: `activityCountsSql` gives `live_widgets 2`, `live_dashboards 1`, `placements 2` (links by both users to U's widgets, not the foreign one), `active_days` equal to the number of distinct `floor(block / 43200)` values across `created_at` and `updated_at` of U's widgets and dashboards; `expiringSoonSql` returns only entities within 43,200 blocks of the head, soonest first; `recentSql` labels kinds `Created` and `Patched` correctly and uses `name` for widgets and `title` for dashboards as `label`; nothing written by the other creator appears; invalid addresses throw.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-home-sql.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the builders on top of `dashCte`. The head comes from `(SELECT block FROM live_head)` exactly as `lib/views.ts` does.

- [ ] **Step 4: Run** the test file. Expected: PASS.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/sql.ts apps/web/test/dash-home-sql.test.ts
git commit -m "feat(web): home queries for dashboards, widgets and activity"
```

### Task 3: Home page `/me`

**Files:**
- Create: `apps/web/app/me/page.tsx`, `apps/web/app/me/layout.tsx` (metadata), `apps/web/components/widgets/DashboardCard.tsx`, `apps/web/components/widgets/ActivityPanel.tsx`, `apps/web/components/widgets/HomePage.tsx`, `apps/web/lib/dash/home.ts`
- Test: `apps/web/test/dash-home.test.tsx`

**Interfaces:**
- Consumes: Task 2 builders, `useTimedQuery`, `fetchWidgets`, `usePending`, `LoginGate`, `ExtendButton`, `TimeLeft`, `ChartIcon`, `dashApi.createDashboard`, `withSession`, `useDashAuth`.
- Produces:

```ts
export type HomeDashboard = { key: string; title: string; widgets: number; updatedAt: number | null; syncing: boolean }
export function mergeDashboards(rows: unknown[][], pending: PendingWrite[]): HomeDashboard[]   // pending dashboard upserts not yet in rows go first with widgets 0; rows win once present; pending deletes hide rows
export function editedAgo(updatedAt: number | null, head?: number): string                     // 'edited 2h ago' using blockAge from lib/format.ts; 'edited just now' when null
export function DashboardCard({ item, head }: { item: HomeDashboard; head?: number }): JSX.Element
export function ActivityPanel(props: { counts: { live_widgets: number; live_dashboards: number; placements: number; active_days: number } | null; expiring: unknown[][]; recent: unknown[][]; head?: number }): JSX.Element
export function HomePage(): JSX.Element
```

- [ ] **Step 1: Write the failing tests:** `mergeDashboards` puts a pending new dashboard first with `syncing: true`, drops it once the SQL rows contain its key, and hides a row with a pending delete; `editedAgo`; `DashboardCard` links to `/d/<key>` and reads `4 widgets · edited 2h ago` (`1 widget` singular); `ActivityPanel` shows the four tile labels from UI §3 including the Placements tooltip text, the footnote `Counts cover live entities only.`, and the two empty list messages verbatim; recent rows link the entity key to `/widgets/<key>` for widgets and `/d/<key>` for dashboards and show no transaction hash; a logged out render of `HomePage` (auth context `anonymous`) shows the `LoginGate` copy; the empty dashboards and empty widgets states use UI §3 copy.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-home.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** per UI §3. My widgets fetches payloads for the listed keys with one `fetchWidgets` call (chunks of 50) to know `lifetimeDays` for `ExtendButton`; until loaded the Extend button is hidden. "+ New dashboard" opens the dialog ("Dashboard title", "Create dashboard"), calls `withSession(() => dashApi.createDashboard({ title }), requestLogin)`, adds a pending dashboard write with `fields: { title }`, then routes to `/d/<key>/edit`. The header chip shows `shortHex(address)`.

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/app/me apps/web/components/widgets/DashboardCard.tsx apps/web/components/widgets/ActivityPanel.tsx apps/web/components/widgets/HomePage.tsx apps/web/lib/dash/home.ts apps/web/test/dash-home.test.tsx
git commit -m "feat(web): logged in home with dashboards, widgets and activity"
```

### Task 4: Project docs

**Files:**
- Modify: `README.md`, `SPECS.md`, `DEVELOPER.md`, `CHANGELOG.md`, `arkiv/schema.md`, `test/deployment.test.ts`

**Interfaces:**
- Consumes: CONTEXT.md sections 6, 8 and 9; the code from plans 1 to 3 (read it; describe what exists, not what was planned).

- [ ] **Step 1: Extend `test/deployment.test.ts` first** (failing): `arkiv/schema.md` contains `widget`, `dashboard`, `link`, `lifetimeDays`, `arkiv-sql-indexer-dash`, `executeBatch`, `predictEntityKeys`, `patchEntity`; `README.md` contains `DASHBOARD_PRIVATE_KEY`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_PRIVY_APP_ID`, the `GET /api/dash/config` wallet endpoint, and a line matching `/INDEX_EXPRESSION='\$creator = addr\(0x[0-9a-f]{40}\) OR \$creator = addr\(0x[0-9a-f]{40}\)'/`; `SPECS.md` no longer contains `Saved queries stored as Arkiv entities (P2). Not implemented.`; `DEVELOPER.md` contains `apps/web/.env.local`. Add `SPECS.md` to the list of files checked for dash punctuation only if it passes today (run the check once; if SPECS.md already has dashes outside code blocks, leave it out and say so in the commit message body).

- [ ] **Step 2: Run** `bun test ./test/deployment.test.ts`. Expected: FAIL on the new assertions.

- [ ] **Step 3: Write the docs.**
  - `arkiv/schema.md`: a new section "Widget dashboards" with the three entity types (attribute table in the existing format, payload JSON examples from spec §6, enums, size spans), expiry per type (widget 1, 7, 30 or 90 days; extend capped at 90 days remaining; dashboard 90 days reset on organize; link follows its dashboard), every operation (create, create plus link in one `executeBatch` with `predictEntityKeys`, edit with `patchEntity`, extend with `ExpirationTime.atBlock`, delete, organize batch, delete dashboard batch), and the exact `arkiv_query` expressions the server and browser send (`scopeExpr`, `dashboardBundleExpr`, `widgetExtendExpr`, key chunks) with their `select`. State the trust boundary: reads always filter `$creator` on the dashboard wallet.
  - `README.md`: a "Widgets and dashboards" section (what users can do, Privy login with Google, Discord, X or Telegram, nothing personal on chain, the backend wallet pays, everything public), environment variables, the self hosting rule with the example `INDEX_EXPRESSION='$creator = addr(0x1f61c3cac1612c020f64739b128c5f198939c8cd) OR $creator = addr(<dashboard wallet, lowercase>)'` using the agent one address from the Demo identities table (lowercased), the re-index note (a changed expression needs a fresh data directory), the Privy dashboard step (enable the four providers and embedded wallets) as the owner's setup step, the Demo identities table noting that agent one also serves as the dashboard wallet, page list updated with `/widgets`, `/widgets/new`, `/widgets/<key>`, `/d/<key>`, `/d/<key>/edit`, `/me`, and the Roadmap without saved queries.
  - `SPECS.md`: goal 10 becomes implemented as widgets and dashboards; replace section 11 with a summary of the feature pointing to the design spec and `arkiv/schema.md`; section 9 pages list; section 12 security: the web app now has write endpoints (Privy access token plus personal_sign session, rate limits, serial queue, payload and SQL guard validation, secrets only in the web runtime env); section 14 deployment env rows.
  - `DEVELOPER.md`: workspace table entry for `apps/web/lib/dash` and `app/api/dash`; the test files; that Next.js loads env files from `apps/web`, so for local development copy or link the root `.env.local` to `apps/web/.env.local` or export the variables; nonces and rate limits are in memory, so run one web instance.
  - `CHANGELOG.md`: one Unreleased bullet describing the feature.

- [ ] **Step 4: Run** `bun test ./test/deployment.test.ts ./apps/web/test`. Expected: PASS. Grep the edited prose for ` - `, `—`, `–` outside code blocks and list items and fix any hit.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add README.md SPECS.md DEVELOPER.md CHANGELOG.md arkiv/schema.md test/deployment.test.ts
git commit -m "docs: widgets and dashboards on Arkiv, environment and self hosting rules"
```
