# Widget dashboards plan 2: login, nav and widgets

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Required Reading

1. `docs/superpowers/plans/2026-10-20-widget-dashboards/CONTEXT.md` (all sections).
2. `docs/superpowers/plans/2026-10-20-widget-dashboards/01-backend-write-api.md`, Interfaces blocks only (the modules this plan calls).
3. UI doc `docs/superpowers/specs/2026-10-20-widget-dashboards-ui.md` sections 0, 1, 2, 4 and 9.
4. Spec section 9.1 and 9.3.
5. Existing code: `apps/web/lib/indexdb.ts` (`run`), `apps/web/lib/use-query.ts`, `apps/web/lib/use-index.ts`, `apps/web/lib/views.ts` (`Widget`), `apps/web/components/dash/AreaChart.tsx` (`QueryChart`), `apps/web/components/dash/WidgetCard.tsx` (`WidgetBody`, `StatBody`), `apps/web/components/dash/TopBar.tsx`, `apps/web/components/playground/Playground.tsx` and `useSqlEditor.ts`, `apps/web/app/layout.tsx`.

**Goal:** Visitors can log in with Privy from the top bar, write a query, pick and configure a chart, save it to Arkiv as a widget, and open, edit, extend and share the widget page; logged in users can add a widget to one of their dashboards from that page.

**Architecture:** A small client auth context reads the session cookie through `/api/dash/auth/session` and mounts the Privy SDK lazily (dynamic import) only when a login or logout runs, so the existing pages do not load Privy. Widget configuration is rendered by extending the existing `QueryChart` through an adapter `toChartWidget(payload)`. Editor state is a pure reducer; components stay thin. Payloads are read from Arkiv RPC; lists come from local DuckDB; writes go through `lib/dash/api.ts` and leave a pending write so pages update before the index catches up.

**Tech Stack:** Next.js 16 client components, `@privy-io/react-auth` 3.50.0, recharts 3, CodeMirror via `useSqlEditor`, DuckDB WASM through `IndexDb`, Bun test with `renderToStaticMarkup`.

**Spec:** `docs/superpowers/specs/2026-10-20-widget-dashboards-design.md`

## Global Constraints

- CONTEXT.md sections 2, 8, 9 and 10 apply.
- "The landing, showcase and playground stay as they are apart from one nav button." (spec §4). Showcase charts must render exactly as before: every new `Widget` field is optional and absent fields keep today's behavior (existing `test/dashboard.test.tsx` and `test/showcase.test.tsx` must still pass unchanged).
- Privy is imported only by `components/auth/PrivyBridge.tsx`, which is loaded with `next/dynamic` and `ssr: false` (`apps/web/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`).
- "Auto default after first Run: one row and one numeric column gives Counter; a time column plus a number gives Line; text plus a number gives Bar, or H bar above 8 rows; otherwise Table." (spec §9.3).
- Layout, copy and states come from the UI doc sections named in each task; do not invent copy.

## Review Focus

1. Right after a first social login the embedded wallet may not exist yet; the handshake must wait for `user.wallet.address` (up to 20 seconds) instead of failing, and closing the Privy modal must resolve the login as cancelled rather than hang. Pinned in Task 5 (`waitForWallet`).
2. A save that fails (rate limited, session expired, chain error) must keep the draft and show the UI copy; a 401 must trigger one login and one retry. Pinned in Task 3 (`withSession`) and Task 7 (editor state stays mounted across the retry).
3. Results with zero rows, null cells, bigint values or a non numeric Y column must render the empty state or a number, never `NaN` or `Infinity`. Pinned in Task 2.
4. A stored widget whose SQL fails `checkWidgetSql` (written before a guard change, or crafted) must not run in the viewer's DuckDB; the page shows the guard reason. Pinned in Task 8.
5. Editing SQL after a run must require a new run before Save (the saved preview must match the saved SQL). Pinned in Task 7 (`canSave`).

---

### Task 1: Result column types and a row cap for widget queries

**Files:**
- Modify: `apps/web/lib/indexdb.ts` (`run` also returns `types`)
- Modify: `apps/web/lib/use-query.ts` (`QueryControl.maxRows`)
- Modify: `apps/web/lib/arrow-value.ts` (add `arrowTypeName`)
- Test: `apps/web/test/arrow-value.test.ts` (extend)

**Interfaces:**
- Produces: `IndexDb.run(sql, maxRows?)` resolves `{ columns, types, rows, truncated, elapsedMs }` where `types[i] = arrowTypeName(field.type)`; `export function arrowTypeName(type: { typeId?: number; toString(): string }): string` returns a lowercase simple name: `text`, `integer`, `float`, `decimal`, `boolean`, `timestamp`, `date`, `time`, `other`; `QueryControl` gains `maxRows?: number` and `useTimedQuery` passes `control.maxRows ?? Infinity` to `db.run`; `TimedResult.data` gains `types?: string[]`.

- [ ] **Step 1: Add failing tests** to `apps/web/test/arrow-value.test.ts` asserting `arrowTypeName({ typeId })` maps 5 and 20 (Utf8, LargeUtf8) to `text`, 2 (Int) to `integer`, 3 (Float) to `float`, 7 (Decimal) to `decimal`, 6 (Bool) to `boolean`, 10 (Timestamp) to `timestamp`, 8 (Date) to `date`, 9 (Time) to `time`, anything else (for example 12, or a missing typeId) to `other`. Use local numeric constants the way `lib/arrow-value.ts` already does (`const DECIMAL = 7`); these are the Arrow `Type` enum ids.

- [ ] **Step 2: Run** `bun test ./apps/web/test/arrow-value.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `arrowTypeName` and wire it into `IndexDb.run` (one extra array built from `reader.schema.fields`) and the `maxRows` control. `ResultsGrid` and existing callers ignore `types`.

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/indexdb.ts apps/web/lib/use-query.ts apps/web/lib/arrow-value.ts apps/web/test/arrow-value.test.ts
git commit -m "feat(web): query results carry column types and an optional row cap"
```

### Task 2: Chart extensions and the widget payload adapter

**Files:**
- Modify: `apps/web/lib/views.ts` (`Widget` gains optional fields and kind `line`)
- Modify: `apps/web/components/dash/AreaChart.tsx` (`QueryChart`)
- Create: `apps/web/lib/dash/chart.ts`, `apps/web/components/widgets/CounterBody.tsx`, `apps/web/components/widgets/WidgetPreview.tsx`
- Test: `apps/web/test/dash-chart.test.tsx`

**Interfaces:**
- Consumes: `WidgetPayload`, `WidgetMapping`, `CounterConfig`, `NumberFormat`, `ChartType` from `lib/dash/schema.ts`; `numericColumns` from `lib/table.ts`; `compact` from `lib/format.ts`.
- Produces:

```ts
// lib/views.ts, Widget additions (all optional)
kind: ... | 'line'; stacking?: 'off' | 'stack' | 'percent'; numberFormat?: NumberFormat; colors?: Record<string, string>; legend?: boolean; labels?: boolean; xTitle?: string; yTitle?: string
// lib/dash/chart.ts
export type ResultData = { columns: string[]; types?: string[]; rows: unknown[][] }
export function toChartWidget(p: WidgetPayload, id: string): Widget
export function formatNumber(value: unknown, fmt: NumberFormat): string
export function sortRows(data: ResultData, mapping: WidgetMapping): ResultData
export function autoChart(data: ResultData): { chart: ChartType; mapping: WidgetMapping; counter: CounterConfig | null }
export function counterSummary(cfg: CounterConfig, data: ResultData): { text: string; label: string } | null
// components
export function CounterBody({ config, data }: { config: CounterConfig; data: ResultData }): JSX.Element
export function WidgetPreview({ payload, query, id }: { payload: WidgetPayload; query: TimedResult; id: string }): JSX.Element   // counter -> CounterBody, else WidgetBody(toChartWidget(payload), sorted data)
```

- [ ] **Step 1: Write the failing tests** in `apps/web/test/dash-chart.test.tsx`:

```ts
test('toChartWidget maps chart types per the UI doc table', () => {
  const base = emptyWidget()
  const kind = (chart: ChartType, mapping = {}) => toChartWidget({ ...base, chart, mapping: { ...base.mapping, x: 'x', y: ['n'], ...mapping } }, 'w').kind
  expect(['table', 'hbar', 'line', 'area', 'donut'].map(c => kind(c as ChartType))).toEqual(['table', 'bar', 'line', 'area', 'donut'])
  expect(kind('bar')).toBe('histogram'); expect(kind('bar', { stacking: 'stack' })).toBe('stacked-bar'); expect(kind('bar', { groupBy: 'g' })).toBe('stacked-bar')
  const w = toChartWidget({ ...base, name: 'N', sql: 'SELECT 1', chart: 'line', mapping: { ...base.mapping, x: 'day', y: ['a'], groupBy: 'g', stacking: 'percent' },
    format: { ...base.format, number: '0.00%', colors: { a: 'c3' }, xTitle: 'Day' } }, 'w1')
  expect(w).toMatchObject({ id: 'w1', title: 'N', sql: 'SELECT 1', x: 'day', y: ['a'], series: 'g', stacking: 'percent', numberFormat: '0.00%', colors: { a: 'var(--c3)' }, xTitle: 'Day' })
})
test('formatNumber', () => {
  expect(formatNumber(1234567.8, '0,0')).toBe('1,234,568'); expect(formatNumber(1234n, '0,0')).toBe('1,234')
  expect(formatNumber(1234, '0.0a')).toBe('1.2k'); expect(formatNumber(2_500_000, '0.0a')).toBe('2.5m'); expect(formatNumber(12, '0.0a')).toBe('12.0')
  expect(formatNumber(0.1234, '0.00%')).toBe('12.34%')
  for (const v of [null, undefined, 'x', NaN, Infinity]) expect(formatNumber(v, '0,0')).toBe('')
})
test('autoChart follows spec 9.3', () => {
  expect(autoChart({ columns: ['n'], types: ['integer'], rows: [[5]] }).chart).toBe('counter')
  expect(autoChart({ columns: ['n'], types: ['integer'], rows: [[5]] }).counter).toEqual({ column: 'n', row: 0, prefix: '', suffix: '', label: '', decimals: 0, compact: false })
  expect(autoChart({ columns: ['created_at', 'n'], types: ['integer', 'integer'], rows: [[1, 2], [3, 4]] })).toMatchObject({ chart: 'line', mapping: { x: 'created_at', y: ['n'] } })
  expect(autoChart({ columns: ['day', 'n'], types: ['date', 'integer'], rows: [[1, 2], [3, 4]] }).chart).toBe('line')
  expect(autoChart({ columns: ['creator', 'n'], types: ['text', 'integer'], rows: Array.from({ length: 8 }, (_, i) => ['c' + i, i]) }).chart).toBe('bar')
  expect(autoChart({ columns: ['creator', 'n'], types: ['text', 'integer'], rows: Array.from({ length: 9 }, (_, i) => ['c' + i, i]) }).chart).toBe('hbar')
  expect(autoChart({ columns: ['a', 'b'], types: ['text', 'text'], rows: [['x', 'y']] }).chart).toBe('table')
  expect(autoChart({ columns: [], rows: [] }).chart).toBe('table')
})
test('sortRows', () => {
  const data = { columns: ['x', 'n'], rows: [['b', 1], ['a', 3], ['c', 2]] }
  expect(sortRows(data, { ...emptyWidget().mapping, x: 'x', y: ['n'], sort: 'x' }).rows.map(r => r[0])).toEqual(['a', 'b', 'c'])
  expect(sortRows(data, { ...emptyWidget().mapping, x: 'x', y: ['n'], sort: 'ydesc' }).rows.map(r => r[0])).toEqual(['a', 'c', 'b'])
  expect(sortRows(data, { ...emptyWidget().mapping, sort: 'query' })).toBe(data)
})
test('counter summary and rendering', () => {
  const cfg = { column: 'n', row: 0, prefix: '$', suffix: ' rows', label: 'Live', decimals: 1, compact: true }
  expect(counterSummary(cfg, { columns: ['n'], rows: [[12345]] })).toEqual({ text: '$12.3k rows', label: 'Live' })
  expect(counterSummary(cfg, { columns: ['n'], rows: [] })).toBeNull()
  expect(renderToStaticMarkup(<CounterBody config={cfg} data={{ columns: ['n'], rows: [[12345]] }}/>)).toContain('stat-value')
})
test('extended QueryChart never shows NaN and keeps showcase defaults', () => {
  for (const chart of ['line', 'bar', 'hbar', 'area', 'donut'] as ChartType[]) {
    const w = toChartWidget({ ...emptyWidget(), name: 'N', chart, mapping: { ...emptyWidget().mapping, x: 'x', y: ['n'], stacking: 'percent' }, format: { ...emptyWidget().format, labels: true, number: '0.0a' } }, 'w')
    expect(renderToStaticMarkup(<QueryChart widget={w} data={{ columns: ['x', 'n'], rows: [] }}/>)).toContain('No rows yet')
    const html = renderToStaticMarkup(<QueryChart widget={w} data={{ columns: ['x', 'n'], rows: [['a', null], ['b', 'oops'], ['c', 10n]] }}/>)
    expect(html).not.toContain('NaN'); expect(html).not.toContain('Infinity')
  }
})
```

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-chart.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** `QueryChart` changes, all gated on the new optional fields: a `line` branch using recharts `LineChart` and `Line` (`strokeWidth={2}`, `dot={false}`, no fill); `stackId` is `'total'` when `widget.stacking` is `stack` or `percent`, or (when `stacking` is undefined) when `widget.series` is set, which is today's behavior; `stackOffset="expand"` on the bar and area charts for `percent`; Y axis `tickFormatter` uses `formatNumber` when `numberFormat` is set (percent stacking always formats ticks as `0.00%` of the 0 to 1 fraction); `XAxis`/`YAxis` `label` from `xTitle`/`yTitle`; `LabelList` on bars and lines when `labels` is true; series color is `widget.colors?.[key] ?? palette`; the `chart-key` legend shows when `(widget.legend ?? true) && keys.length >= 2`. `toChartWidget` maps tokens to `var(--cN)`. Time column detection in `autoChart`: type `timestamp`, `date` or `time`, or an integer column whose name matches `/(_at|block|time|date|day|hour|bucket)$/i`; numbers use `numericColumns`.

- [ ] **Step 4: Run** `bun test ./apps/web/test` (showcase and dashboard tests must still pass) and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/views.ts apps/web/components/dash/AreaChart.tsx apps/web/lib/dash/chart.ts apps/web/components/widgets apps/web/test/dash-chart.test.tsx
git commit -m "feat(web): line charts, stacking, number formats and counters for saved widgets"
```

### Task 3: Client API, session handshake, pending writes and time labels

**Files:**
- Create: `apps/web/lib/dash/api.ts`, `apps/web/lib/dash/auth-client.ts`, `apps/web/lib/dash/pending.ts`, `apps/web/lib/dash/time.ts`
- Test: `apps/web/test/dash-client.test.ts`

**Interfaces:**
- Consumes: CONTEXT.md §8 contract; `DashErrorCode`, `SessionInfo`, `WriteResult`, `BLOCKS_PER_DAY`, `MAX_REMAINING_DAYS` from `lib/dash/schema.ts`.
- Produces:

```ts
// api.ts
export class DashApiError extends Error { code: DashErrorCode; status: number; retryAfterSec?: number }
export type DashApi = {
  session(): Promise<SessionInfo | null>; nonce(): Promise<{ nonce: string; message: string }>
  createSession(accessToken: string, nonce: string, signature: string): Promise<SessionInfo>; logout(): Promise<void>
  createWidget(body: { widget: WidgetPayload; addTo?: { dashboard: string; size: Size } }): Promise<WriteResult>
  updateWidget(key: string, widget: WidgetPayload): Promise<WriteResult>; deleteWidget(key: string): Promise<WriteResult>; extendWidget(key: string): Promise<WriteResult>
  createDashboard(body: { title: string; description?: string }): Promise<WriteResult>; updateDashboard(key: string, body: { title: string; description?: string }): Promise<WriteResult>
  deleteDashboard(key: string): Promise<WriteResult>; organize(key: string, body: { title?: string; items: { link: string | null; widget: string; size: Size }[] }): Promise<WriteResult>
  addLink(key: string, body: { widget: string; size: Size }): Promise<WriteResult> }
export function createDashApi(fetchImpl?: typeof fetch, base?: string): DashApi
export const dashApi: DashApi
// auth-client.ts
export function runSessionHandshake(deps: { api: DashApi; getAccessToken(): Promise<string | null>; signMessage(message: string): Promise<string> }): Promise<SessionInfo>
export function withSession<T>(fn: () => Promise<T>, requestLogin: () => Promise<boolean>): Promise<T>
export function saveErrorMessage(error: unknown): string   // UI §4 copy: 429 -> 'Too many saves. Try again in a minute.', else "Couldn't save to Arkiv. Your draft is kept. Try again."
// pending.ts
export type PendingWrite = { key: string; kind: 'widget' | 'dashboard' | 'link'; op: 'upsert' | 'delete'; afterBlock: number; at: number; txHash?: string; fields?: Record<string, string | number> }
export function addPending(w: Omit<PendingWrite, 'at'>, now?: number): void
export function listPending(now?: number): PendingWrite[]        // drops entries older than 5 minutes
export function clearPending(key: string): void
export function usePending(): PendingWrite[]                     // useSyncExternalStore over the module store
export function useSynced(write: PendingWrite | undefined, version: number): boolean   // runs syncedSql (Task 4) through useTimedQuery; true clears the entry
// time.ts
export function timeLeftLabel(expiresAt: number, head: number): { text: string; tone: 'live' | 'warn' | 'expired' }
export function extendPreview(expiresAt: number, head: number, lifetimeDays: number): { daysAdded: number; atCap: boolean }
```

- [ ] **Step 1: Write the failing tests:**

```ts
test('api sends JSON with same origin credentials and maps errors', async () => {
  const seen: any[] = []
  const fake = (async (url: string, init: RequestInit) => { seen.push({ url, init }); return new Response(JSON.stringify({ error: 'rate_limited', message: 'slow' }), { status: 429, headers: { 'retry-after': '30' } }) }) as any
  const api = createDashApi(fake, '')
  await expect(api.extendWidget('0xk')).rejects.toMatchObject({ code: 'rate_limited', status: 429, retryAfterSec: 30 })
  expect(seen[0].url).toBe('/api/dash/widgets/0xk/extend'); expect(seen[0].init.method).toBe('POST')
  expect(new Headers(seen[0].init.headers).get('content-type')).toBe('application/json'); expect(seen[0].init.credentials).toBe('same-origin')
})
test('session() returns null on 401', async () => { /* fake answering 401 -> null; 200 { address, login } -> that object */ })
test('handshake signs the server message and posts the token', async () => {
  // fake api records calls: nonce -> { nonce: 'n1', message: 'm1' }; signMessage receives 'm1' and returns '0xsig'; createSession called with ('tok', 'n1', '0xsig')
  // getAccessToken resolving null -> rejects with an Error
})
test('withSession logs in once on 401 and retries once', async () => {
  // first call throws DashApiError 401, requestLogin resolves true, second call resolves 'ok' -> 'ok', fn called twice
  // requestLogin false -> rethrows the 401; a 403 is not retried
})
test('time labels follow the UI chips', () => {
  expect(timeLeftLabel(0 + 43200 * 6 + 1800 * 23, 0)).toEqual({ text: '6d 23h left', tone: 'live' })
  expect(timeLeftLabel(1800 * 3, 0)).toEqual({ text: 'Expires in 3h', tone: 'warn' })
  expect(timeLeftLabel(30 * 40, 0)).toEqual({ text: 'Expires in 40m', tone: 'warn' })
  expect(timeLeftLabel(100, 100)).toEqual({ text: 'Expired', tone: 'expired' })
})
test('extend preview clips at 90 days remaining', () => {
  expect(extendPreview(43200, 0, 7)).toEqual({ daysAdded: 7, atCap: false })
  expect(extendPreview(43200 * 87, 0, 7)).toEqual({ daysAdded: 3, atCap: false })
  expect(extendPreview(43200 * 90, 0, 7)).toEqual({ daysAdded: 0, atCap: true })
})
test('pending writes expire after five minutes', () => {
  addPending({ key: 'k', kind: 'widget', op: 'upsert', afterBlock: 5 }, 0)
  expect(listPending(299_999).map(w => w.key)).toEqual(['k']); expect(listPending(300_001)).toEqual([])
})
```

Write the commented tests as real assertions.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-client.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** `daysAdded` is `Math.floor((target - expiresAt) / BLOCKS_PER_DAY)` with `target` from the same formula as the server (`min(expiresAt + days * 43200, head + 90 * 43200)`); `atCap` when `target <= expiresAt`. `useSynced` is a thin hook; its SQL comes from `syncedSql` in Task 4, so implement `useSynced` in Task 4 if you prefer to keep this task import free (keep the export in `pending.ts`).

- [ ] **Step 4: Run** the test file. Expected: PASS.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/api.ts apps/web/lib/dash/auth-client.ts apps/web/lib/dash/pending.ts apps/web/lib/dash/time.ts apps/web/test/dash-client.test.ts
git commit -m "feat(web): dashboard API client, login handshake, pending writes and expiry labels"
```

### Task 4: RPC reads and DuckDB queries for widgets

**Files:**
- Create: `apps/web/lib/dash/read.ts`, `apps/web/lib/dash/sql.ts`
- Modify: `apps/web/lib/dash/pending.ts` (`useSynced` uses `syncedSql`)
- Test: `apps/web/test/dash-read.test.ts`, helper `apps/web/test/dash-duckdb.ts`

**Interfaces:**
- Consumes: `queryAll`, `keysExprs`, `dashboardBundleExpr`, `scopeExpr`, `asWidget`, `asDashboard`, `asLink` from `lib/dash/entities.ts`.
- Produces:

```ts
// read.ts (rpc is createBrowserRpc(publicDashConfig().rpcUrl) in components, a fake in tests)
type Rpc = Pick<ArkivRpc, 'query'>
export function fetchWidget(rpc: Rpc, wallet: string, key: string): Promise<{ head: number; widget: WidgetEntity | null }>
export function fetchWidgets(rpc: Rpc, wallet: string, keys: string[]): Promise<{ head: number; widgets: Map<string, WidgetEntity> }>
export function fetchDashboardBundle(rpc: Rpc, wallet: string, key: string): Promise<{ head: number; dashboard: DashboardEntity | null; links: LinkEntity[] }>
// sql.ts
export function dashCte(wallet: string): string                          // the CTE in CONTEXT.md 7.1
export function userDashboardsSql(wallet: string, user: string, widgetKey: string | null): string   // columns: key, title, widgets, has_widget, updated_at; newest updated first
export function widgetUsageSql(wallet: string, widgetKey: string, user: string | null): string      // one row: dashboards (distinct dashboards with a live link to it), mine (true when user owns one of them)
export function syncedSql(key: string, afterBlock: number, op: 'upsert' | 'delete'): string         // one row, column n: 1 when synced
```

- [ ] **Step 1: Write the failing tests:** `fetchWidgets` with 51 keys calls `query` twice and drops rows from another creator; `fetchDashboardBundle` returns the dashboard, links sorted by `link.position` then key (two links with the same position keep a stable key order), ignores links of another dashboard, and returns `dashboard: null` when absent; `fetchWidget` returns null for a payload that fails `parseWidgetPayload`. For `sql.ts`: each builder throws on an invalid wallet, user or key (`"0x12"`, `"x' OR 1=1"`); `dashCte(W)` contains `e.creator = '<lowercase W>'` and `'arkiv-sql-indexer-dash'`; `syncedSql(K, 7, 'upsert')` contains `updated_at > 7` and `NOT attrs_pending`; `syncedSql(K, 7, 'delete')` returns 1 when the key is absent (assert the SQL contains `count(*) = 0`). Add one end to end check that the SQL parses and runs in native DuckDB, importing `DuckDBInstance` from `'../../../packages/core/node_modules/@duckdb/node-api'` (the same path precedent as `apps/web/scripts/bench-views.ts:1`): create plain tables `entities` (columns as SPECS.md §8 public view) and `attributes`, insert a dashboard, a widget and a link written by the wallet plus one widget row by another creator, then assert `userDashboardsSql` returns the dashboard with `widgets = 1` and `has_widget = true`, and `widgetUsageSql` returns `dashboards = 1, mine = true`. Export a helper `nativeDb(rows)` from `apps/web/test/dash-duckdb.ts` so plans 3 and 4 reuse it.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-read.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** per the interfaces; links counted in SQL are rows of type `link` whose `widget` attribute equals the key; dashboard widget counts count live links per `dashboard` attribute.

- [ ] **Step 4: Run** the test file and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/read.ts apps/web/lib/dash/sql.ts apps/web/lib/dash/pending.ts apps/web/test/dash-read.test.ts apps/web/test/dash-duckdb.ts
git commit -m "feat(web): creator scoped widget reads over RPC and DuckDB"
```

### Task 5: Auth context, lazy Privy bridge, nav button and avatar menu

**Files:**
- Create: `apps/web/components/auth/DashAuthProvider.tsx`, `apps/web/components/auth/PrivyBridge.tsx`, `apps/web/components/widgets/AccountButton.tsx`, `apps/web/components/widgets/AvatarMenu.tsx`, `apps/web/components/widgets/LoginGate.tsx`
- Modify: `apps/web/app/layout.tsx` (wrap `children` in `DashAuthProvider`), `apps/web/components/dash/TopBar.tsx` (render `AccountButton` right of `.top-sp`, before `ThemeToggle`), `apps/web/app/globals.css` (only classes the UI doc requires that do not exist yet)
- Test: `apps/web/test/dash-auth-ui.test.tsx`

**Interfaces:**
- Consumes: `publicDashConfig`, `dashApi`, `runSessionHandshake`, `withSession`.
- Produces:

```ts
export type DashAuth = { status: 'loading' | 'anonymous' | 'authenticated' | 'disabled'; address?: string; login?: Login; confirming: boolean; error: string | null;
  requestLogin(): Promise<boolean>; logout(): Promise<void>; refresh(): Promise<void> }
export function DashAuthProvider({ children }: { children: React.ReactNode }): JSX.Element
export function useDashAuth(): DashAuth            // default context value: status 'disabled' and no-op functions, so components render in tests without a provider
export const DashAuthContext: React.Context<DashAuth>
// PrivyBridge.tsx (default export, loaded with next/dynamic ssr:false from DashAuthProvider)
export default function PrivyBridge(props: { appId: string; mode: 'login' | 'logout'; onDone(session: SessionInfo | null): void; onError(reason: 'cancelled' | 'no_wallet' | 'failed'): void }): JSX.Element
export function waitForWallet(read: () => string | undefined, opts?: { timeoutMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<string>  // exported for tests; default 20000 / 250
export function menuIndex(key: string, index: number, count: number): number    // AvatarMenu arrow key helper
```

- [ ] **Step 1: Write the failing tests:**
  - `renderToStaticMarkup(<DashAuthContext.Provider value={{ ...auth, status: 'anonymous' }}><AccountButton/></DashAuthContext.Provider>)` contains `Build your dashboard` and the short label `Build`; with `status: 'disabled'` and `'loading'` it renders an empty string; with `status: 'authenticated', address, login: 'google'` it renders a button with `aria-haspopup="menu"`.
  - `AvatarMenu` rendered open contains the short address (`shortHex`), `via Google`, `My home` linking to `/me`, and `Log out`.
  - `LoginGate` contains the UI §2 heading, body and button copy verbatim.
  - `menuIndex('ArrowDown', 1, 2) === 0`, `menuIndex('ArrowUp', 0, 2) === 1`, `menuIndex('Home', 1, 2) === 0`, `menuIndex('End', 0, 2) === 1`.
  - `waitForWallet` resolves once the reader returns an address on the third poll, and rejects after the timeout with a fake `sleep`.
  - Static import check: read `components/auth/DashAuthProvider.tsx`, `components/dash/TopBar.tsx` and `app/layout.tsx` source with `readFileSync` and assert none contains `@privy-io/react-auth`; `PrivyBridge.tsx` does.
  - `NAV_ITEMS` is unchanged in this plan (the existing landing test keeps passing).

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-auth-ui.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `DashAuthProvider`: when `publicDashConfig().enabled` is false the status stays `disabled`. Otherwise on mount `dashApi.session()` sets `authenticated` or `anonymous`. `requestLogin` sets `confirming`, mounts `PrivyBridge` in `login` mode and resolves true on `onDone(session)` (status becomes `authenticated`) or false on `onError` (sets `error` to "Login didn't finish. Try again." except for `cancelled`, which clears silently). `logout` calls `dashApi.logout()`, sets `anonymous`, then mounts the bridge in `logout` mode to end the Privy session.
  - `PrivyBridge` renders `<PrivyProvider appId={appId} config={{ loginMethods: ['google', 'discord', 'twitter', 'telegram'], embeddedWallets: { ethereum: { createOnLogin: 'all-users' }, showWalletUIs: false } }}>` around a runner. Login runner: once `usePrivy().ready`, if not authenticated call `useLogin({ onError }).login()` once (`useLogin` callbacks: `apps/web/node_modules/@privy-io/react-auth/dist/dts/index.d.ts:2154`, `events-context-bL_o3tyT.d.ts:8-19`); treat `useModalStatus().isOpen` going from true to false while still unauthenticated as `cancelled` (`index.d.ts:3672`); when authenticated, `waitForWallet(() => user?.wallet?.address)`, then `runSessionHandshake({ api: dashApi, getAccessToken, signMessage: async m => (await signMessage({ message: m }, { address })).signature })`. Logout runner: once ready, `await logout()` then `onDone(null)`. Guard every effect against running twice (React strict mode) with a ref.
  - `AccountButton`, `AvatarMenu`, `LoginGate`: follow UI §1 and §2 for layout and copy. After a successful login from the nav button, navigate to `/me` with `useRouter().push` (the page arrives in plan 4).

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/components/auth apps/web/components/widgets/AccountButton.tsx apps/web/components/widgets/AvatarMenu.tsx apps/web/components/widgets/LoginGate.tsx apps/web/app/layout.tsx apps/web/components/dash/TopBar.tsx apps/web/app/globals.css apps/web/test/dash-auth-ui.test.tsx
git commit -m "feat(web): Build your dashboard button with lazy Privy login and avatar menu"
```

### Task 6: Shared widget controls

**Files:**
- Create: `apps/web/components/widgets/ChartIcon.tsx`, `ChartPicker.tsx`, `TimeLeft.tsx`, `ExtendButton.tsx`, `SyncChip.tsx`
- Test: `apps/web/test/dash-controls.test.tsx`

**Interfaces:**
- Consumes: `timeLeftLabel`, `extendPreview` (Task 3); `CHART_TYPES`.
- Produces:

```ts
export function ChartIcon({ type, size }: { type: ChartType; size?: number }): JSX.Element
export const CHART_LABELS: Record<ChartType, string>      // Table, Counter, Bar, H bar, Line, Area, Donut (UI §0 table)
export function ChartPicker({ value, onChange }: { value: ChartType; onChange(c: ChartType): void }): JSX.Element
export function pickerIndex(key: string, index: number): number     // roving tabindex: ArrowRight/ArrowDown +1, ArrowLeft/ArrowUp -1, wraps over 7, Home 0, End 6
export function TimeLeft({ expiresAt, head }: { expiresAt: number; head?: number }): JSX.Element
export type ExtendPhase = 'idle' | 'confirm' | 'extending' | 'done' | 'error'
export function extendStep(phase: ExtendPhase, event: 'click' | 'timeout' | 'escape' | 'success' | 'failure' | 'settled'): ExtendPhase
export function ExtendButton({ widgetKey, expiresAt, head, lifetimeDays, canExtend, onExtended }: { widgetKey: string; expiresAt: number; head?: number; lifetimeDays: LifetimeDays; canExtend: boolean; onExtended?(r: WriteResult): void }): JSX.Element | null
export function SyncChip({ write, version }: { write?: PendingWrite; version: number }): JSX.Element | null
```

- [ ] **Step 1: Write the failing tests:** `ChartPicker` markup has `role="radiogroup"`, `aria-label="Chart type"`, seven `role="radio"` items with the seven labels, exactly one `aria-checked="true"` and `tabindex="0"`; `pickerIndex` cases; `TimeLeft` renders the label text with `quiet-chip` for live, `state state-behind` for warn and `state state-stale` for expired; `extendStep` transitions: idle+click dialog, dialog+cancel idle, dialog+escape idle, dialog+confirm extending, extending+success done, extending+failure error (dialog stays open), error+confirm extending, done+settled idle; `ExtendDialog` markup has `role="dialog"`, `aria-modal="true"`, the UI §0 title, body and the buttons `Cancel` and `Extend`; `ExtendButton` renders null when `canExtend` is false or the widget is expired, a disabled button titled `Already at the 90 day maximum` at the cap, and `Extend` otherwise; `SyncChip` renders `Syncing` only when given a write.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-controls.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement** following UI §0 ("Chips", "ChartPicker row", "Expiry and Extend", "Write pending"). `ExtendButton` calls `withSession(() => dashApi.extendWidget(key), auth.requestLogin)`, adds a pending write on success and calls `onExtended`; the confirm is the `ExtendDialog` modal from UI §0 "Expiry and Extend" (owner decision: a popup, not an inline two step button), whose body uses `Adds N days` (`Adds 1 day` when N is 1) and the new expiry from `extendPreview`. Add `ExtendDialog.tsx` to this task's files.

- [ ] **Step 4: Run** the test file and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/components/widgets apps/web/test/dash-controls.test.tsx
git commit -m "feat(web): chart picker, expiry chip, extend button and syncing chip"
```

### Task 7: Widget editor and `/widgets/new`

**Files:**
- Create: `apps/web/lib/dash/editor-state.ts`, `apps/web/components/widgets/WidgetSettings.tsx`, `apps/web/components/widgets/WidgetEditor.tsx`, `apps/web/components/widgets/widgets.module.css`, `apps/web/app/widgets/new/page.tsx`, `apps/web/app/widgets/layout.tsx` (metadata only, like `app/playground/layout.tsx`)
- Test: `apps/web/test/dash-editor.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 to 6; `useSqlEditor`, `useDocumentTheme` from `components/playground/useSqlEditor.ts`; `DataTable`, `RunBadge`, `TypeTag`; `userDashboardsSql`.
- Produces:

```ts
export type RunResult = { columns: string[]; types: string[]; rows: unknown[][]; ms: number }
export type EditorState = { draft: WidgetPayload; original: WidgetPayload | null; result: RunResult | null; ranSql: string | null; runError: string | null; chartTouched: boolean; addTo: { dashboard: string; size: Size } | null }
export type EditorAction = { type: 'name'; value: string } | { type: 'lifetime'; value: LifetimeDays } | { type: 'sql'; value: string } | { type: 'ran'; sql: string; result: RunResult }
  | { type: 'runError'; error: string } | { type: 'chart'; value: ChartType } | { type: 'mapping'; patch: Partial<WidgetMapping> } | { type: 'format'; patch: Partial<WidgetFormat> }
  | { type: 'counter'; patch: Partial<CounterConfig> } | { type: 'addTo'; value: { dashboard: string; size: Size } | null }
export function initEditor(original?: WidgetPayload | null, addToDashboard?: string | null): EditorState
export function editorReducer(state: EditorState, action: EditorAction): EditorState
export function canSave(state: EditorState): { ok: true } | { ok: false; reason: string }
export const DRAFT_KEY = 'dash-widget-draft-v1'
export function WidgetEditor(props: { mode: 'create' | 'edit'; initial: EditorState; widgetKey?: string; onSaved(result: WriteResult, payload: WidgetPayload): void }): JSX.Element
```

- [ ] **Step 1: Write the failing tests:**
  - First successful `ran` applies `autoChart` (chart, mapping, counter) unless `chartTouched`; later runs keep the user's chart; `chart` action sets `chartTouched` and, when switching to `counter`, fills `counter` from `autoChart` or a default, and when leaving `counter` sets it to null.
  - `canSave`: no name gives `Give your widget a name`; no result gives `Run the query first`; editing `sql` after a run gives `Run the query first` again until a new `ran` with the same SQL; SQL failing `checkWidgetSql` gives the guard reason; in edit mode an unchanged draft gives `{ ok: false, reason: 'No changes' }`; otherwise ok.
  - `initEditor(null, D)` sets `addTo` to `{ dashboard: D, size: 'md' }`; after choosing chart `counter` the default size follows `defaultSize` unless the user changed the size.
  - `renderToStaticMarkup` of the `/widgets/new` page body with no session renders `LoginGate` copy and no `Save to Arkiv` (owner decision: creating a widget requires login).
  - `renderToStaticMarkup(<WidgetEditor mode="create" initial={initEditor()} onSaved={() => {}}/>)` contains `Untitled widget`, the four lifetime labels from UI §4, `Save to Arkiv`, `Run the query to see a preview.`, and the `Chart type` radiogroup.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-editor.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Follow UI §4 for layout, copy and states. `/widgets/new` requires login: logged out it renders `LoginGate` (UI §2). `WidgetEditor` holds `useReducer(editorReducer, initial)`, runs SQL with `db.run(sql, 5000)` from `useIndex()` (refuse to run when `checkWidgetSql` fails and show its reason as the run error), renders the result meta with `TypeTag` per column type, `ChartPicker`, `WidgetPreview` fed with the last run result, and `WidgetSettings` (Data section, Format `<details>`, counter fields; hide fields that do not apply). Save: `withSession(() => dashApi.createWidget({ widget, addTo }) , requestLogin)` in create mode or `updateWidget` in edit mode; the editor is only reachable with a session, but if the session expired `withSession` reauthenticates through Privy while the editor state stays mounted, so no draft storage is needed; on success add a pending write (`kind: 'widget'`, `afterBlock`, `txHash`, `fields: { name, chart }`) and, when `linkKey` is present, a pending link; on failure show `saveErrorMessage(error)`. `app/widgets/new/page.tsx` reads `?dashboard=` with `useSearchParams` (wrap in `Suspense` like `app/showcase/page.tsx` does with its live parts), and on save routes to `/widgets/<key>`. The "Add to dashboard" select lists `userDashboardsSql(wallet, address, null)` rows plus pending dashboards.

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/editor-state.ts apps/web/components/widgets apps/web/app/widgets apps/web/test/dash-editor.test.tsx
git commit -m "feat(web): widget editor with auto chart, settings and save to Arkiv"
```

### Task 8: Widget page `/widgets/<key>` and the add to dashboard picker

**Files:**
- Create: `apps/web/app/widgets/[key]/page.tsx`, `apps/web/components/widgets/WidgetPage.tsx`, `apps/web/components/widgets/AddToDashboardPicker.tsx`
- Test: `apps/web/test/dash-widget-page.test.tsx`

**Interfaces:**
- Consumes: `fetchWidget`, `widgetUsageSql`, `userDashboardsSql`, `WidgetEditor`, `WidgetPreview`, `TimeLeft`, `ExtendButton`, `SyncChip`, `usePending`, `playgroundHref` from `components/dash/WidgetCard.tsx`.
- Produces:

```ts
export type WidgetPageMode = 'loading' | 'missing' | 'owner' | 'viewer'
export function widgetPageMode(input: { loaded: boolean; widget: WidgetEntity | null; address?: string }): WidgetPageMode
export function WidgetPage({ widgetKey }: { widgetKey: string }): JSX.Element
export type PickerRow = { key: string; title: string; widgets: number; added: boolean }
export function pickerRows(rows: unknown[][], pending: PendingWrite[], widgetKey: string): PickerRow[]   // SQL rows (key, title, widgets, has_widget, updated_at) merged with pending dashboards and links; pending link for this widget marks added
export function AddToDashboardPicker({ widgetKey, chart, onClose }: { widgetKey: string; chart: ChartType; onClose(): void }): JSX.Element
```

- [ ] **Step 1: Write the failing tests:** `widgetPageMode` returns `loading` before load, `missing` for null, `owner` when `address` equals `widget.user` (case insensitive), else `viewer` (also when logged out); `pickerRows` merges a pending new dashboard (shown with 0 widgets) and marks a dashboard `added` when SQL says `has_widget` or a pending link for the widget exists; a static render of the picker body (export a pure `PickerList` component taking `rows` and `phase` per row) shows `Already added` for added rows, `Adding…`, `Added ✓` with a `View` link to `/d/<key>`, and the last row `+ New dashboard`; a static render of the viewer header shows `+ Add to my dashboard` and `Open in playground` with `href` equal to `playgroundHref(sql)`; the missing state shows the UI §4 expired copy and `Browse widgets` linking to `/widgets`; a stored widget whose SQL fails `checkWidgetSql` renders the guard reason in `.error` and never calls `db.run` (assert by rendering the preview component with a `run` spy prop).

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-widget-page.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** Follow UI §4 "Saved page" and UI §9. `WidgetPage` fetches the payload with `fetchWidget(createBrowserRpc(rpcUrl), wallet, key)` on mount and after a successful save or extend; while a pending upsert for this key exists, prefer its `fields` for the name and show `SyncChip`. Owner: `WidgetEditor mode="edit"` with `initEditor(widget.widget)`, meta line (creator via `AddressLink`, `TimeLeft`, `ExtendButton` with `canExtend`, last tx hash only when this browser made the latest write, "on N dashboards" from `widgetUsageSql`). Viewer: read only preview first (runs the stored SQL through `useTimedQuery(sql, version, { maxRows: 5000 })` only when `checkWidgetSql` passes), then read only SQL (`SqlBlock`) and results; `ExtendButton` visible when `widgetUsageSql` reports `mine`. `AddToDashboardPicker` writes with `withSession(() => dashApi.addLink(dashboard, { widget, size: defaultSize(chart) }), requestLogin)`; "+ New dashboard" calls `createDashboard({ title })` then `addLink`, adding pending writes for both; logged out opens Privy first, then the picker. Map 409 `conflict` to the row state `Already added`.

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: PASS, clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/app/widgets apps/web/components/widgets apps/web/test/dash-widget-page.test.tsx
git commit -m "feat(web): widget page with owner editing, extend and add to dashboard picker"
```
