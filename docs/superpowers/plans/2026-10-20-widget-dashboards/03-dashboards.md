# Widget dashboards plan 3: dashboard view, organize and import

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Required Reading

1. `docs/superpowers/plans/2026-10-20-widget-dashboards/CONTEXT.md` (all sections).
2. Interfaces blocks of `01-backend-write-api.md` (organize contract) and `02-login-and-widgets.md` (client modules and components this plan reuses).
3. UI doc `docs/superpowers/specs/2026-10-20-widget-dashboards-ui.md` sections 0, 2, 5 (card anatomy only), 6, 7 and 8.
4. Spec sections 6.3, 6.4, 9.4, 9.5 and 9.7.
5. Existing code: `apps/web/components/showcase/showcase.module.css` (`.grid`, `.card`, spans `--lg/--md/--sm`), `apps/web/components/dash/WidgetCard.tsx`, `apps/web/lib/use-query.ts`.

**Goal:** Anyone can open a public dashboard at `/d/<key>` and see its widgets computed in their own browser; the owner can reorder, resize, import, remove and rename on `/d/<key>/edit` and save it all with one Arkiv batch.

**Architecture:** Dashboard structure (dashboard payload, links with size and position, widget payloads) comes from Arkiv RPC with two creator scoped queries; widget lists for import come from local DuckDB. The organize page edits a pure draft reducer and converts it to the plan 1 organize input on Done. Drag and drop uses dnd-kit with handle only listeners. Widget previews run only for visible cards.

**Tech Stack:** Next.js 16 client pages, `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, recharts through `WidgetPreview`, Bun test.

**Spec:** `docs/superpowers/specs/2026-10-20-widget-dashboards-design.md`

## Global Constraints

- CONTEXT.md sections 2, 6, 8 and 10 apply.
- "Widgets render in link `position` order, wrapping by link size. Each widget runs its SQL in the viewer's browser. Expired or missing widget: slot shows the stored name and an "expired" badge, nothing runs." (spec §9.4)
- "New links are appended at the end with a default size per chart type: counter xs, donut sm, everything else md. Size and order are changed on the organize page." and "Imports from the organize page join the unsaved draft and are written on Done." (spec §9.7)
- "Previews need the widget payload, fetched as one batched `$key` query per page of 12, and render only when a card scrolls into view" (spec §9.6, applies to the import modal cards too).
- Owner only actions are hidden for non owners and enforced again by the server.
- Layout, copy and states come from the UI doc sections named in each task.

## Review Focus

1. A link whose widget expired or was deleted must render the expired slot with the stored link name and never run SQL; the organize page must still allow removing it. Pinned in Task 2 and Task 3.
2. Links with equal or missing positions (two concurrent appends) must render in a stable order (position, then key) on both view and organize pages. Pinned in Task 2.
3. Importing a widget that is already on the dashboard, or more than 48 in total, must be impossible in the draft (disabled cards, capped selection) because the server rejects the whole batch. Pinned in Task 3 and Task 5.
4. One widget with failing SQL or SQL rejected by the guard must show its error in its own card while the other cards still render. Pinned in Task 1.
5. Leaving the organize page with unsaved changes (New widget link, browser navigation) must confirm first. Pinned in Task 6 (`leaveGuard`).

---

### Task 1: Widget query hook and the saved widget card

**Files:**
- Modify: `apps/web/lib/use-query.ts` (`QueryControl.skip`)
- Create: `apps/web/lib/dash/use-widget-query.ts`, `apps/web/lib/dash/slots.ts` (pure types and helpers, no React), `apps/web/components/widgets/SavedWidgetCard.tsx`
- Test: `apps/web/test/dash-saved-card.test.tsx`

**Interfaces:**
- Consumes: `useTimedQuery`, `checkWidgetSql`, `WidgetPreview`, `TimeLeft`, `RunBadge`, `SqlBlock`.
- Produces:

```ts
// use-query.ts: QueryControl gains skip?: boolean; when true the effect does not run and the result is { loading: false }
export function widgetQueryPlan(payload: WidgetPayload | null | undefined, enabled: boolean): { run: false; error?: string } | { run: true; sql: string }
export function useWidgetQuery(payload: WidgetPayload | null | undefined, version: number, enabled?: boolean): TimedResult
export type SlotStatus = 'loading' | 'live' | 'expired'      // in lib/dash/slots.ts
export function SavedWidgetCard(props: { id: string; name: string; payload: WidgetPayload | null; status: SlotStatus; size: Size; version: number; head?: number;
  expiresAt?: number; widgetKey?: string; owner?: boolean; query?: TimedResult }): JSX.Element
```

`query` lets tests inject a result; components normally omit it and the card calls `useWidgetQuery`.

- [ ] **Step 1: Write the failing tests:** `widgetQueryPlan(undefined, true)` and `(payload, false)` give `{ run: false }`; a payload with `DELETE FROM merged_entities` gives `{ run: false, error: <guard reason> }`; a valid payload gives `{ run: true, sql }`. Static renders: status `expired` shows the stored name, `Expired` in `.state.state-stale`, the UI §6 sentence, and for `owner` also `Remove it on Organize.`; status `live` with an injected `query` containing an error shows that error inside the card; the card style sets `--lg` to 3, 4, 6, 12 for xs, sm, md, xl and uses the UI §6 mid width spans (`--md` 6 for xs and sm, 12 for md and xl) and `--sm` 12; status `loading` renders the skeleton without running anything.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-saved-card.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** `useWidgetQuery` always calls `useTimedQuery` (hooks are unconditional) with `{ skip: !plan.run, maxRows: 5000 }` and returns `{ loading: false, error }` for a guard failure. `SavedWidgetCard` reuses the showcase card classes (`s.card`, `s.head`, `s.body`, `s.foot`) and footer contents from UI §6 (`RunBadge`, `TimeLeft`, SQL toggle, "Open" to `/widgets/<key>`).

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/use-query.ts apps/web/lib/dash/use-widget-query.ts apps/web/lib/dash/slots.ts apps/web/components/widgets/SavedWidgetCard.tsx apps/web/test/dash-saved-card.test.tsx
git commit -m "feat(web): saved widget card that runs only live, allowed widget SQL"
```

### Task 2: Dashboard view `/d/<key>`

**Files:**
- Create: `apps/web/app/d/[key]/page.tsx`, `apps/web/app/d/layout.tsx` (metadata), `apps/web/components/widgets/DashboardView.tsx`, `apps/web/lib/dash/use-dashboard.ts`
- Modify: `apps/web/lib/dash/slots.ts` (add `Slot`, `dashboardSlots`)
- Test: `apps/web/test/dash-view.test.tsx`

**Interfaces:**
- Consumes: `fetchDashboardBundle`, `fetchWidgets`, `createBrowserRpc`, `useDashAuth().config`, `useDashAuth`, `usePending`, `SyncChip`, `SavedWidgetCard`.
- Produces:

```ts
// lib/dash/slots.ts
export type Slot = { id: string; linkKey: string; widgetKey: string; name: string; size: Size; status: SlotStatus; widget: WidgetEntity | null }
export function dashboardSlots(links: LinkEntity[], widgets: Map<string, WidgetEntity> | null): Slot[]   // links already sorted; widgets null means still loading
// lib/dash/use-dashboard.ts
export type DashboardData = { status: 'loading' | 'missing' | 'ready' | 'error'; head?: number; dashboard: DashboardEntity | null; links: LinkEntity[]; widgets: Map<string, WidgetEntity> | null; error?: string; reload(): void }
export function useDashboard(key: string): DashboardData
export function DashboardView({ dashboardKey }: { dashboardKey: string }): JSX.Element
export function DashboardHeader(props: { title: string; user: string; count: number; owner: boolean; dashboardKey: string }): JSX.Element
```

- [ ] **Step 1: Write the failing tests:** `dashboardSlots` keeps link order, uses the link payload `name` and `size`, gives status `loading` when `widgets` is null, `live` when the widget is present, `expired` otherwise; sorting precondition is covered by plan 2 `fetchDashboardBundle` but add one case with two links at position 2 to show order is preserved as given. Static renders of `DashboardHeader`: owner sees `Organize` (link to `/d/<key>/edit`), `+ Add widget` (link to `/d/<key>/edit?import=1`) and `Copy link`; non owner sees only `Copy link`; meta reads `by <short address> · 5 widgets` (`1 widget` singular). The empty and not found states use the UI §6 copy verbatim (render the state components directly).

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-view.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Follow UI §6. `useDashboard` does `fetchDashboardBundle` then `fetchWidgets` for the distinct widget keys (two RPC queries per load), and reloads when a pending write for this dashboard appears (so the owner returning from Done sees the new layout before the index catches up). An RPC 429 (`RpcError` status 429) becomes `status: 'error'` with the existing `rpcMessage` text from `components/RowActions.tsx`. Owner is `dashboard.user === auth.address`. Copy link copies `location.origin + '/d/' + key` and shows `✓ Link copied` like the playground. The page component reads `params` with `use(params)` or `useParams` (client page; check `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` for the client form).

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/app/d apps/web/components/widgets/DashboardView.tsx apps/web/lib/dash/use-dashboard.ts apps/web/lib/dash/slots.ts apps/web/test/dash-view.test.tsx
git commit -m "feat(web): public dashboard view computed in the visitor's browser"
```

### Task 3: Organize draft reducer

**Files:**
- Create: `apps/web/lib/dash/organize-state.ts`
- Test: `apps/web/test/dash-organize-state.test.ts`

**Interfaces:**
- Consumes: `OrganizeInput` shape from CONTEXT.md §8; `defaultSize`, `MAX_LINKS_PER_DASHBOARD`.
- Produces:

```ts
export type DraftItem = { id: string; link: string | null; widget: string; name: string; chart: ChartType | null; size: Size; imported: boolean;
  expiresAt: number | null; lifetimeDays: LifetimeDays | null; expired: boolean; flash: boolean }
export type OrganizeDraft = { title: string; items: DraftItem[] }
export type ImportCandidate = { key: string; name: string; chart: ChartType; user: string; expiresAt: number; lifetimeDays: LifetimeDays | null }
export type OrganizeAction = { type: 'move'; from: number; to: number } | { type: 'resize'; id: string; size: Size } | { type: 'remove'; id: string }
  | { type: 'import'; widgets: ImportCandidate[]; owner: string } | { type: 'title'; value: string } | { type: 'clearFlash' }
export function draftFromDashboard(dashboard: DashboardEntity, slots: Slot[]): OrganizeDraft
export function organizeReducer(draft: OrganizeDraft, action: OrganizeAction): OrganizeDraft
export function isDirty(draft: OrganizeDraft, original: OrganizeDraft): boolean
export function toOrganizeInput(draft: OrganizeDraft, original: OrganizeDraft): { title?: string; items: { link: string | null; widget: string; size: Size }[] }
export function remainingSlots(draft: OrganizeDraft): number
export function onDashboard(draft: OrganizeDraft): Set<string>          // widget keys already placed
export function announcement(kind: 'start' | 'move' | 'drop' | 'cancel', name: string, position: number, count: number): string
```

- [ ] **Step 1: Write the failing tests:** `draftFromDashboard` makes one item per slot with `id = linkKey`, `imported` true when the widget's `user` differs from the dashboard `user`, `expired` from slot status; `move` uses `arrayMove` semantics; `resize` and `remove` by id; `import` appends unknown widgets with `id = 'new:' + key`, `link: null`, `size: defaultSize(chart)`, `flash: true`, skips widgets already placed, and stops at 48 items; `clearFlash` clears every flash; `isDirty` is false for an identical draft and after a move back to the original order, true after a resize, title change, import or remove; `toOrganizeInput` omits `title` when unchanged and trims it when changed, and lists items in draft order with their `link`; `announcement` returns the UI §7 strings exactly: `Picked up Top 10 creators, position 2 of 5.`, `Moved to position 3 of 5.`, `Dropped at position 3 of 5.`, `Reorder cancelled.`.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-organize-state.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** the reducer as pure functions (no React import). Use `arrayMove` from `@dnd-kit/sortable`.

- [ ] **Step 4: Run** the test file. Expected: PASS.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/organize-state.ts apps/web/test/dash-organize-state.test.ts
git commit -m "feat(web): organize draft with reorder, resize, import and remove"
```

### Task 4: Widget list query, payload pages and the browse card

**Files:**
- Modify: `apps/web/lib/dash/sql.ts` (add `widgetListSql`, `widgetCountSql`)
- Create: `apps/web/lib/dash/use-widget-list.ts`, `apps/web/lib/dash/use-in-view.ts`, `apps/web/components/widgets/WidgetBrowseCard.tsx`
- Test: `apps/web/test/dash-browse.test.tsx`

**Interfaces:**
- Consumes: `dashCte`, `nativeDb` (test helper from plan 2), `fetchWidgets`, `useWidgetQuery`, `ChartIcon`, `CHART_LABELS`, `TimeLeft`.
- Produces:

```ts
export type WidgetListQuery = { search: string; chart: ChartType | null; sort: 'newest' | 'used' | 'expiring'; user: string | null; limit: number; offset: number }
export type WidgetListItem = { key: string; name: string; chart: ChartType; user: string; expiresAt: number; createdAt: number; uses: number }
export function widgetListSql(wallet: string, q: WidgetListQuery): string     // columns key, name, chart, usr, expires_at, created_at, uses
export function widgetCountSql(wallet: string, q: Omit<WidgetListQuery, 'sort' | 'limit' | 'offset'>): string   // one row: n
export function toListItems(rows: unknown[][]): WidgetListItem[]
export function useWidgetList(q: WidgetListQuery, version: number): { items: WidgetListItem[]; total: number | null; loading: boolean; error?: string; payloads: Map<string, WidgetEntity> | undefined; payloadError?: string }
export function useInView<T extends Element>(): [React.RefCallback<T>, boolean]   // IntersectionObserver, rootMargin '200px'; true forever once seen; true when IntersectionObserver is missing
export function WidgetBrowseCard(props: { item: WidgetListItem; payload: WidgetEntity | null | undefined; head?: number; version: number; variant: 'explorer' | 'pick';
  selected?: boolean; disabled?: boolean; onToggle?(): void; onAdd?(): void; visibleOverride?: boolean; query?: TimedResult }): JSX.Element
```

- [ ] **Step 1: Write the failing tests:**
  - With `nativeDb` seeded with four widgets (names `Top creators`, `Top_owners`, `Expiry`, `50% done`, two charts, different `created_at`, `expires_at` and link counts) plus one foreign widget: `newest` orders by `created_at` desc then key; `used` by `uses` desc; `expiring` by `expires_at` asc; `chart: 'donut'` filters; `user` filters by owner; search `top` matches both top widgets case insensitively, search `_` matches only `Top_owners`, search `%` matches only `50% done`, search `x' OR '1'='1` matches nothing and does not error; a creator address prefix search matches by `usr`; the foreign widget never appears; `widgetCountSql` agrees with the unpaged list length; `limit 2 offset 2` returns the third and fourth rows.
  - `toListItems` converts numbers and lowercases keys.
  - Static renders of `WidgetBrowseCard`: explorer variant shows name, `CHART_LABELS[chart]`, `by <short address>`, `on 12 dashboards` (`on 1 dashboard`), `TimeLeft`, `Open` linking to `/widgets/<key>` and `+ Add to dashboard`; with `payload` undefined shows the skeleton; with `payload` null shows `Preview unavailable`; with `visibleOverride` false shows the faded `ChartIcon` and does not run (`query` absent and `useWidgetQuery` disabled); pick variant has `aria-pressed` reflecting `selected`, and when `disabled` shows `Already on this dashboard` and is not a toggle button.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-browse.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Search escaping: lowercase the term, escape `\`, `%`, `_` with a backslash, double single quotes, and use `lower(name) LIKE '%<term>%' ESCAPE '\'`; when the term looks like a hex prefix (`/^0x[0-9a-f]{0,40}$/i`) also match `usr LIKE '<term>%'`. `useWidgetList` runs the list and count SQL through `useTimedQuery` (rerun on `version`) and then one `fetchWidgets` call for the page's keys (12 per page), keyed by the joined key list so a new page triggers exactly one RPC query. Card layout per UI §5 (preview 160px in explorer, 120px in pick).

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/sql.ts apps/web/lib/dash/use-widget-list.ts apps/web/lib/dash/use-in-view.ts apps/web/components/widgets/WidgetBrowseCard.tsx apps/web/test/dash-browse.test.tsx
git commit -m "feat(web): searchable widget list with lazy previews in browse cards"
```

### Task 5: Import modal

**Files:**
- Create: `apps/web/components/widgets/ImportModal.tsx`, `apps/web/lib/dash/import-state.ts`
- Test: `apps/web/test/dash-import.test.tsx`

**Interfaces:**
- Consumes: `useWidgetList`, `WidgetBrowseCard`, `onDashboard`, `remainingSlots`.
- Produces:

```ts
export type ImportState = { tab: 'mine' | 'all'; search: string; chart: ChartType | null; pages: number; selected: string[] }
export function initImport(): ImportState                                  // tab 'mine', pages 1
export function importReducer(s: ImportState, a: { type: 'tab'; value: 'mine' | 'all' } | { type: 'search'; value: string } | { type: 'chart'; value: ChartType | null }
  | { type: 'more' } | { type: 'toggle'; key: string; disabled: Set<string>; remaining: number }): ImportState
export function addLabel(count: number): string                            // 'Add widgets' at 0, 'Add 1 widget', 'Add 2 widgets'
export function ImportModal(props: { dashboardTitle: string; placed: Set<string>; remaining: number; onAdd(widgets: ImportCandidate[]): void; onClose(): void }): JSX.Element
```

- [ ] **Step 1: Write the failing tests:** `toggle` adds and removes a key, ignores keys in `disabled`, and refuses to add beyond `remaining`; `tab`, `search` and `chart` reset `pages` to 1 but keep `selected`; `more` increments `pages`; `addLabel(0|1|2)`; a static render of the modal (inject list data through a `listOverride` prop) shows the title `Import widgets into “Top creators”`, tabs `My widgets` and `All widgets` with counts, the footer `2 selected`, and the empty My widgets copy from UI §8 with `+ New widget`.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-import.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** per UI §8: `role="dialog"`, `aria-modal="true"`, focus trap (focus first focusable on open, wrap Tab, Escape closes), pages of 12 with "Load more", `WidgetBrowseCard variant="pick"`. My widgets filters `user = auth.address`. On "Add N widgets" call `onAdd` with the selected items mapped to `ImportCandidate` (lifetime from the loaded payload when present).

- [ ] **Step 4: Run** the test file and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/components/widgets/ImportModal.tsx apps/web/lib/dash/import-state.ts apps/web/test/dash-import.test.tsx
git commit -m "feat(web): import modal for adding any widget to a dashboard draft"
```

### Task 6: Organize page `/d/<key>/edit`

**Files:**
- Create: `apps/web/app/d/[key]/edit/page.tsx`, `apps/web/components/widgets/OrganizeBoard.tsx`, `apps/web/components/widgets/OrganizeRow.tsx`, `apps/web/components/widgets/LayoutPreview.tsx`
- Test: `apps/web/test/dash-organize-ui.test.tsx`

**Interfaces:**
- Consumes: Tasks 2 to 5, `ExtendButton`, `LoginGate`, `withSession`, `dashApi.organize`, `addPending`, `useDashAuth`.
- Produces:

```ts
export type OrganizeAccess = 'loading' | 'login' | 'not_owner' | 'missing' | 'owner'
export function organizeAccess(input: { auth: DashAuth['status']; address?: string; data: DashboardData }): OrganizeAccess
export function leaveGuard(dirty: boolean, confirm: (message: string) => boolean): boolean   // true when navigation may proceed; message 'Leave without saving your changes?'
export function OrganizeRow(props: { item: DraftItem; index: number; count: number; head?: number; onResize(size: Size): void; onRemove(): void; dragHandle?: React.ReactNode }): JSX.Element
export function LayoutPreview({ items }: { items: DraftItem[] }): JSX.Element
export function OrganizeBoard({ dashboardKey }: { dashboardKey: string }): JSX.Element
```

- [ ] **Step 1: Write the failing tests:** `organizeAccess` returns `login` when anonymous, `not_owner` when the address differs, `missing` for a missing dashboard, `owner` otherwise, `loading` while either side loads; `leaveGuard(false, spy)` returns true without calling `spy`, `leaveGuard(true, () => false)` returns false and passes the exact message; static render of `OrganizeRow` shows the handle with `aria-label="Reorder Top 10 creators"`, the size select with `XS SM MD XL`, the imported chip `by <short address>` for imported items, remove with `aria-label="Remove Top 10 creators"`, and for an expired item 50% opacity class and only remove enabled; `LayoutPreview` renders one block per item with `--lg` equal to `SIZE_SPAN[size]` and the size label; the not owner state shows `Only the owner can organize this dashboard.` and `View dashboard`.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-organize-ui.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** per UI §7. `OrganizeBoard` holds `useReducer(organizeReducer, draftFromDashboard(...))` once data is ready, the original draft for `isDirty`, and renders: header (inline title input, "Unsaved changes" when dirty, "+ Import widget", "+ New widget" to `/widgets/new?dashboard=<key>` through `leaveGuard`, "Done"), the sortable list and `LayoutPreview` (phone tabs "Order" and "Preview"). dnd-kit setup exactly as UI §7 "Drag and drop": `DndContext` with `closestCenter`, `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`, `SortableContext` with `verticalListSortingStrategy`, `useSortable` listeners only on the handle, transform built as `translate3d(${x}px, ${y}px, 0)` (no `@dnd-kit/utilities`), and `accessibility.announcements` built from `announcement`. `onDragEnd` dispatches `move`. `?import=1` opens `ImportModal` on load; its `onAdd` dispatches `import` with `owner` = dashboard user. Done: when not dirty navigate to `/d/<key>`; else `withSession(() => dashApi.organize(key, toOrganizeInput(draft, original)), requestLogin)`, add a pending write (`kind: 'dashboard'`, `afterBlock`), then navigate; errors show `saveErrorMessage`. Register `beforeunload` while dirty.

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/app/d apps/web/components/widgets/OrganizeBoard.tsx apps/web/components/widgets/OrganizeRow.tsx apps/web/components/widgets/LayoutPreview.tsx apps/web/test/dash-organize-ui.test.tsx
git commit -m "feat(web): drag and drop organize page saved with one Arkiv batch"
```
