# Widget dashboards: shared context for all plans

Every plan in this directory lists this file under Required Reading. It holds the decisions that more than one plan relies on: module map, exact interfaces, entity schema, API contract, environment, verified library facts and test conventions. A plan only carries its own delta.

## 1. Sources

- Approved spec: `docs/superpowers/specs/2026-10-20-widget-dashboards-design.md` (cited below as "spec §n").
- UI design: `docs/superpowers/specs/2026-10-20-widget-dashboards-ui.md` (cited as "UI §n"). Every UI task follows the named UI section for layout, copy and states. Plans never invent visual design or copy; where a plan names copy it is quoted from the UI doc.
- Repo docs: `SPECS.md`, `DEVELOPER.md`, `arkiv/schema.md`, `apps/web/AGENTS.md` (this Next.js 16 differs from older versions; read `apps/web/node_modules/next/dist/docs/` before using a Next API you are unsure of).

Plan order (each depends on the previous ones being merged):

1. `01-backend-write-api.md`: schema, validation, SQL guard, entity decoding, auth (Privy plus personal_sign), session, rate limits, write queue, Arkiv write operations, API routes, env and compose.
2. `02-login-and-widgets.md`: client auth (lazy Privy), nav button and avatar menu, client API, RPC reads, pending writes, chart extensions, widget editor `/widgets/new`, widget page `/widgets/<key>`, add to dashboard picker.
3. `03-dashboards.md`: dashboard view `/d/<key>`, organize `/d/<key>/edit` with drag and drop, browse card, import modal.
4. `04-explorer-home-docs.md`: explorer `/widgets`, home `/me` with activity, "Widgets" nav item, README, SPECS.md, DEVELOPER.md, CHANGELOG.md, `arkiv/schema.md`.

## 2. Executor rules (apply to every task)

- Codex implements one task per run. Codex has no network, cannot install packages, cannot bind localhost sockets, cannot run a dev server and cannot commit. Every test runs offline with fakes (no RPC, no Privy, no DuckDB WASM).
- Never add a dependency. Installed and allowed in `apps/web`: `@privy-io/react-auth` 3.50.0, `@privy-io/node` 0.36.0, `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@arkiv-network/sdk` 0.8.1, viem, recharts, react 19.3, next 16.4.2. `@dnd-kit/utilities` is NOT directly resolvable from `apps/web` (only nested under sortable); build transforms by hand (`translate3d(${x}px, ${y}px, 0)`).
- The coordinator runs every `git` command and commits after each task. Commit messages in the plans are final text: no AI attribution, no `Co-Authored-By` lines.
- Never print or log secret values (`DASHBOARD_PRIVATE_KEY`, `PRIVY_APP_SECRET`, cookies, access tokens). Error messages name the variable, never its value.
- Docs prose (README, SPECS.md, DEVELOPER.md, CHANGELOG.md, `arkiv/*.md`) uses no dashes as punctuation (no `—`, `–`, or ` - `). `test/deployment.test.ts` enforces this.
- Go is not involved.

## 3. Commands

Run from the repository root unless stated.

| Purpose | Command | Pass condition |
| :--- | :--- | :--- |
| One web test file | `bun test ./apps/web/test/<file>` | `0 fail` |
| All web tests | `bun test ./apps/web/test` | `0 fail` (baseline before this feature: 112 pass across web plus deployment) |
| Deployment and docs checks | `bun test ./test/deployment.test.ts` | `0 fail` |
| Type check | `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .` | no output, exit 0 (baseline is clean) |

## 4. Test conventions (from `apps/web/test`)

- Runner: `bun:test` (`import { expect, test } from 'bun:test'`). Files live in `apps/web/test/`, named `dash-<topic>.test.ts` or `.test.tsx` for this feature.
- Components are tested with `renderToStaticMarkup` from `react-dom/server` and string assertions (see `test/dashboard.test.tsx`, `test/playground.test.tsx`). There is no DOM library, so interaction logic lives in pure functions or reducers that are tested directly; components stay thin.
- Network is injected: functions take a `fetchImpl` or an object with the methods they call (see `test/proxy.test.ts`, `apps/demo-writer/test/writer.test.ts` for the fake SDK client pattern).
- Route handlers are thin wrappers over `handleX(req, deps, params)` functions; tests build a `Request` and call `handleX` with fake deps.
- Signatures in auth tests are real and offline: `privateKeyToAccount` from `viem/accounts` plus `account.signMessage({ message })`.

## 5. Verified library facts (read from installed source on 20 October 2026)

Privy server (`apps/web/node_modules/@privy-io/node/src`):
- `new PrivyClient({ appId, appSecret })` (`public-api/PrivyClient.ts:46-47,101-118`).
- `client.utils().auth().verifyAccessToken(token): Promise<{ app_id, issuer, issued_at, expiration, session_id, user_id }>` (`public-api/services/utils/auth.ts:27`, response type `lib/auth.ts:49-62`). Throws `InvalidAuthTokenError` on a bad or expired token (`lib/auth.ts:191-200`). It verifies ES256, issuer `privy.io`, audience = app id, against the app JWKS fetched from Privy (`lib/auth.ts:209-238`).
- `client.users()._get(userId): Promise<User>` (`resources/users/users.ts:91`), `User.linked_accounts: LinkedAccount[]` (`users.ts:1631-1649`).
- Embedded Ethereum wallet account: `type: 'wallet'`, `wallet_client_type: 'privy'`, `connector_type: 'embedded'`, `chain_type: 'ethereum'`, `address` (`users.ts:909-947`; predicate `isEmbeddedWalletLinkedAccount` in `lib/user-utils.ts`, exported from the package root).
- Login account types: `google_oauth`, `discord_oauth`, `twitter_oauth`, `telegram` (`users.ts:1047,759,1500,1402`), each with `latest_verified_at: number | null`.

Privy React (`apps/web/node_modules/@privy-io/react-auth/dist/dts`):
- `PrivyProvider({ appId, config, children })` (`index.d.ts:586-624`). `config.loginMethods` accepts `'google' | 'twitter' | 'discord' | 'telegram'` (`types-CoijvGho.d.ts:1753`). `config.embeddedWallets = { ethereum: { createOnLogin: 'all-users' }, showWalletUIs: false }` (`types-CoijvGho.d.ts:1956-2010,2474`).
- `usePrivy(): { ready, authenticated, user, login, logout(): Promise<void>, getAccessToken(): Promise<string | null> }` (`index.d.ts:717-892`). `user.wallet?.address` is the embedded wallet (`types-CoijvGho.d.ts:1506-1519`).
- `useSignMessage().signMessage({ message }, { uiOptions?, address? }): Promise<{ signature }>`; it is EIP 191 personal_sign and signs without a prompt when `showWalletUIs` is false (`index.d.ts:1103-1125,3415-3427`).

Arkiv SDK 0.8.1 (`apps/web/node_modules/@arkiv-network/sdk/src`):
- Wallet actions: `createEntity`, `patchEntity`, `deleteEntity`, `extendEntity`, `changeOwnership`, `executeBatch` (`clients/decorators/arkivWallet.ts`). There is NO `updateEntity`; spec §6.4 "updateEntity" is implemented with `patchEntity({ entityKey, set, payload, contentType })` (`actions/wallet/patchEntity.ts`), which replaces the payload and sets the named attributes.
- `executeBatch({ creates, patches, deletes, extensions })` returns `{ txHash, createdEntities }` (`actions/wallet/executeBatch.ts`). Operations apply in the order creates, patches, deletes, extensions (`utils/arkivTransactions.ts:150-160`).
- An extension SETS a new expiry and the engine rejects one that does not move the expiry later (`actions/wallet/extendEntity.ts:12-26`). Use `ExpirationTime.atBlock(BigInt(target))` for absolute targets (`utils/expirationTime.ts`), and `ExpirationTime.fromSeconds(s)` for lifetimes.
- `predictEntityKeys({ owner, count })` reads the owner's entity nonce, so prediction and send must happen inside the same serial write queue slot (`actions/public/predictEntityKeys.ts`). The demo writer shows the batch pattern (`apps/demo-writer/src/writer.ts:36-47`).
- Limits: attribute string values at most 128 bytes (`attr/values.ts:40`), at most 32 attributes (`attr/attributes.ts:11`), payload at most 128 KiB (`attr/attributes.ts:17`).
- Attribute helpers `addr(value)`, `key(value)` from `@arkiv-network/sdk/attr`; plain strings are `str`. Query helpers `eq`, `and`, `or`, `render` from `@arkiv-network/sdk/query`; `$creator` and `$key` names are allowed (`query/expression.test.ts:118`). `eq('name', 'x')` renders `name = str('x')`.
- One block is 2 seconds, so one day is 43,200 blocks.

dnd-kit: `DndContext`, `closestCenter`, `PointerSensor`, `TouchSensor`, `KeyboardSensor`, `useSensor`, `useSensors`, type `DragEndEvent` from `@dnd-kit/core` (`dist/index.d.ts`); `SortableContext`, `useSortable`, `verticalListSortingStrategy`, `sortableKeyboardCoordinates`, `arrayMove` from `@dnd-kit/sortable` (`dist/index.d.ts`).

recharts 3: `LineChart`, `Line`, `LabelList` exported (`types/index.d.ts:22`); `stackOffset` accepts `'expand'` (`types/util/types.d.ts:33`).

## 6. Entity schema (spec §6, exact values)

All three types: `contentType: 'application/json'`, payload is `JSON.stringify` UTF-8 bytes, Arkiv owner and creator is the backend wallet. `project` value is `arkiv-sql-indexer-dash`.

| Type | Attributes (Arkiv type) | Payload |
| :--- | :--- | :--- |
| widget | `type`=`widget` (str), `project` (str), `user` (addr), `login` (str), `name` (str), `chart` (str) | `WidgetPayload` |
| dashboard | `type`=`dashboard`, `project`, `user` (addr), `login`, `title` (str) | `DashboardPayload` |
| link | `type`=`link`, `project`, `user` (addr, dashboard owner), `dashboard` (key), `widget` (key) | `LinkPayload` |

Lifetimes: widget 1, 7, 30 or 90 days chosen by the creator; extend adds `lifetimeDays` but never past 90 days remaining (target = `min(expiresAt + days * 43200, head + 90 * 43200)`). Dashboard 90 days, reset to head plus 90 days on every organize save. A link is created with its dashboard's expiry block and extended with the dashboard on organize save.

Size to span on a 12 column row: xs 3, sm 4, md 6, xl 12. Default size per chart: counter xs, donut sm, everything else md.

## 7. Module map and interfaces

All new web code lives under `apps/web`. "P1" to "P4" name the plan that creates the module. Later plans may add exports to a module but never change an existing signature.

### 7.1 Isomorphic (`lib/dash/`)

`lib/dash/schema.ts` (P1)

```ts
export const DASH_PROJECT = 'arkiv-sql-indexer-dash'
export const CONTENT_TYPE = 'application/json'
export const CHART_TYPES = ['table', 'counter', 'bar', 'hbar', 'line', 'area', 'donut'] as const
export type ChartType = (typeof CHART_TYPES)[number]
export const SIZES = ['xs', 'sm', 'md', 'xl'] as const
export type Size = (typeof SIZES)[number]
export const SIZE_SPAN: Record<Size, number>            // { xs: 3, sm: 4, md: 6, xl: 12 }
export const LIFETIME_DAYS = [1, 7, 30, 90] as const
export type LifetimeDays = (typeof LIFETIME_DAYS)[number]
export const LOGINS = ['google', 'discord', 'x', 'telegram'] as const
export type Login = (typeof LOGINS)[number]
export const NUMBER_FORMATS = ['0,0', '0.0a', '0.00%'] as const
export type NumberFormat = (typeof NUMBER_FORMATS)[number]
export const STACKINGS = ['off', 'stack', 'percent'] as const
export type Stacking = (typeof STACKINGS)[number]
export const SORTS = ['query', 'x', 'ydesc'] as const
export type Sort = (typeof SORTS)[number]
export const COLOR_TOKENS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const   // rendered as var(--cN)
export type ColorToken = (typeof COLOR_TOKENS)[number]
export const BLOCKS_PER_DAY = 43200
export const MAX_REMAINING_DAYS = 90
export const DASHBOARD_LIFETIME_DAYS = 90
export const MAX_LINKS_PER_DASHBOARD = 48
export const LIMITS = { name: 80, attrBytes: 128, sql: 10000, description: 500, payloadBytes: 16384,
  axisTitle: 60, yColumns: 8, colors: 16, column: 128, affix: 16, counterLabel: 60, counterRow: 999, decimals: 6 }
export type WidgetMapping = { x: string | null; y: string[]; groupBy: string | null; stacking: Stacking; sort: Sort }
export type CounterConfig = { column: string; row: number; prefix: string; suffix: string; label: string; decimals: number; compact: boolean }
export type WidgetFormat = { number: NumberFormat; xTitle: string | null; yTitle: string | null; legend: boolean; labels: boolean; colors: Record<string, ColorToken> }
export type WidgetPayload = { v: 1; name: string; sql: string; chart: ChartType; mapping: WidgetMapping; counter: CounterConfig | null; format: WidgetFormat; lifetimeDays: LifetimeDays }
export type DashboardPayload = { v: 1; title: string; description: string }
export type LinkPayload = { v: 1; size: Size; position: number; name: string }
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }
export function parseWidgetPayload(input: unknown, checkSql?: (sql: string) => string | null): Parsed<WidgetPayload>   // default checkSql is checkWidgetSql
export function parseDashboardPayload(input: unknown): Parsed<DashboardPayload>
export function parseLinkPayload(input: unknown): Parsed<LinkPayload>
export function defaultSize(chart: ChartType): Size
export function emptyWidget(): WidgetPayload             // name '', sql '', chart 'table', y [], stacking 'off', sort 'query', number '0,0', legend true, labels false, lifetimeDays 7
export function isHexAddress(value: string): boolean     // /^0x[0-9a-fA-F]{40}$/
export function isEntityKey(value: string): boolean      // /^0x[0-9a-fA-F]{64}$/
export function utf8Bytes(value: string): number
```

`lib/dash/sql-guard.ts` (P1): `export function checkWidgetSql(sql: string): string | null` returns null when allowed, else a short user facing reason.

`lib/dash/entities.ts` (P1)

```ts
export type DashEntity = { key: string; owner: string; creator: string; createdAt: number; updatedAt: number; expiresAt: number; attrs: Record<string, string>; payload: unknown | null }
export type WidgetEntity = DashEntity & { kind: 'widget'; user: string; login: Login; name: string; chart: ChartType; widget: WidgetPayload }
export type DashboardEntity = DashEntity & { kind: 'dashboard'; user: string; login: Login; title: string; dashboard: DashboardPayload }
export type LinkEntity = DashEntity & { kind: 'link'; user: string; dashboardKey: string; widgetKey: string; link: LinkPayload }
export const DASH_SELECT: RpcSelect                      // key, owner, creator, createdAt, updatedAt, expiresAt, attributes, payload all true
export function decodeDashEntity(e: RpcEntity): DashEntity   // lowercase hex, attrs via @asi/core decodeAttribute canonical text, payload hex -> UTF-8 -> JSON (null on any failure)
export function asWidget(e: DashEntity, wallet: string): WidgetEntity | null
export function asDashboard(e: DashEntity, wallet: string): DashboardEntity | null
export function asLink(e: DashEntity, wallet: string): LinkEntity | null
export function scopeExpr(wallet: string): string        // render(and(eq('$creator', addr(w)), eq('project', DASH_PROJECT)))
export function dashboardBundleExpr(wallet: string, dashboardKey: string, extraKeys?: string[]): string
export function widgetExtendExpr(wallet: string, widgetKey: string, caller: string): string
export function keysExprs(wallet: string, keys: string[]): string[]   // keyChunkQueries(scopeExpr(wallet), keys), 50 per chunk
export function queryAll(rpc: Pick<ArkivRpc, 'query'>, expression: string): Promise<{ head: number; entities: DashEntity[] }>
export function jsonPayload(value: object): Uint8Array
```

`as*` return null unless `creator === wallet` (lowercase), `attrs.project === DASH_PROJECT`, `attrs.type` matches, required attributes are present and valid, and the payload parses with the matching `parse*Payload`. This is the defense in depth for spec §8 "trust boundary".

Expressions (exact semantics):
- `dashboardBundleExpr(w, D, extra)` = `scope AND ($key = key(D) OR $key = key(E1) ... OR (type = str('link') AND dashboard = key(D)))`.
- `widgetExtendExpr(w, W, caller)` = `scope AND ($key = key(W) OR (type = str('link') AND widget = key(W) AND user = addr(caller)))`.
- `queryAll` pages with `cursor`, `limit: 200`, `select: DASH_SELECT`, and returns the first page's `blockNumber` as `head`.

`lib/dash/config.ts` (P1)

```ts
export type PublicDashConfig = { enabled: boolean; privyAppId: string; wallet: string; rpcUrl: string }
export function readPublicDashConfig(env: { privyAppId?: string; wallet?: string; rpcUrl?: string }): PublicDashConfig
export function publicDashConfig(): PublicDashConfig     // passes process.env.NEXT_PUBLIC_PRIVY_APP_ID, process.env.NEXT_PUBLIC_DASHBOARD_WALLET, process.env.NEXT_PUBLIC_TIRAMISU_RPC_URL written out literally so Next inlines them
```

`enabled` is true only when the app id is non blank and the wallet is a valid address. `wallet` is lowercase. `rpcUrl` defaults to `https://rpc.tiramisu.db-chain.testnet.arkiv.network`. When disabled, the nav shows no login button and the new pages render a short "not configured" note (UI doc has no copy for it; use "Dashboards are not enabled on this deployment.").

`lib/dash/sql.ts` (P2 creates, P3 and P4 add): DuckDB SQL builders over the public views. Every builder starts from `dashCte(wallet)` (P2), filters `creator = '<wallet>'` and project, validates every interpolated address or key with `isHexAddress`/`isEntityKey` (throw on invalid input) and escapes strings by doubling single quotes. The CTE pivots one row per entity:

```sql
WITH dash AS (
 SELECT e.key, e.created_at, e.updated_at, e.expires_at,
  max(a.value) FILTER (WHERE a.name = 'type') AS type,
  max(a.value) FILTER (WHERE a.name = 'user') AS usr,
  max(a.value) FILTER (WHERE a.name = 'login') AS login,
  max(a.value) FILTER (WHERE a.name = 'name') AS name,
  max(a.value) FILTER (WHERE a.name = 'title') AS title,
  max(a.value) FILTER (WHERE a.name = 'chart') AS chart,
  max(a.value) FILTER (WHERE a.name = 'dashboard') AS dashboard,
  max(a.value) FILTER (WHERE a.name = 'widget') AS widget
 FROM entities e JOIN attributes a ON a.key = e.key
 WHERE e.creator = '<wallet>'
 GROUP BY ALL
 HAVING max(a.value) FILTER (WHERE a.name = 'project') = 'arkiv-sql-indexer-dash')
```

The column is `usr` because `user` is a DuckDB keyword. Rows with `attrs_pending` have no attributes and so are absent until filled; pending writes (7.2) cover that gap.

### 7.2 Client only (P2 unless noted)

- `lib/dash/api.ts`: `createDashApi(fetchImpl?: typeof fetch, base?: string): DashApi` and `DashApiError { code: DashErrorCode; status: number; retryAfterSec?: number }`. Methods mirror section 8.
- `lib/dash/auth-client.ts`: `runSessionHandshake(deps: { api: DashApi; getAccessToken(): Promise<string | null>; signMessage(message: string): Promise<string> }): Promise<SessionInfo>`.
- `lib/dash/read.ts`: `fetchWidget`, `fetchWidgets`, `fetchDashboardBundle` (signatures in plan 2).
- `lib/dash/pending.ts`: pending writes store, `syncedSql`, `useSynced` (plan 2).
- `lib/dash/time.ts`: `timeLeftLabel`, `extendPreview` (plan 2).
- `lib/dash/chart.ts`: `toChartWidget`, `formatNumber`, `autoChart`, `counterSummary`, `sortRows` (plan 2).
- `components/auth/DashAuthProvider.tsx`: `useDashAuth(): DashAuth` with `{ status: 'loading' | 'anonymous' | 'authenticated' | 'disabled'; address?: string; login?: Login; requestLogin(): Promise<boolean>; logout(): Promise<void> }` (plan 2).
- `components/widgets/*`: component names from UI §0. Owning plan: P2 `ChartIcon`, `ChartPicker`, `TimeLeft`, `ExtendButton`, `SyncChip`, `CounterBody`, `LoginGate`, `AvatarMenu`, `AccountButton`, `AddToDashboardPicker`, `WidgetEditor`, `WidgetSettings`; P3 `SavedWidgetCard`, `WidgetBrowseCard`, `ImportModal`, `OrganizeRow`, `LayoutPreview`, `OrganizeBoard`, `DashboardView`; P4 `DashboardCard`, `ActivityPanel`, `ExplorerGrid`.

### 7.3 Server only (`lib/dash/server/`, P1)

Never import these from a client component. Modules: `errors.ts`, `config.ts`, `session.ts`, `nonce.ts`, `rate-limit.ts`, `queue.ts`, `privy.ts`, `auth.ts`, `operations.ts`, `routes.ts`, `deps.ts`. Signatures are in plan 1; the shared ones:

```ts
export type DashErrorCode = 'invalid' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'at_cap' | 'full' | 'rate_limited' | 'busy' | 'disabled' | 'chain'
export type Session = { address: string; login: Login; exp: number }      // address lowercase, exp unix seconds
export type SessionInfo = { address: string; login: Login }
export type WriteResult = { txHash: string; afterBlock: number; key?: string; linkKey?: string; expiresAt?: number }
```

`DashErrorCode`, `SessionInfo` and `WriteResult` are declared in `lib/dash/schema.ts` (isomorphic) so the client can import them; server modules re-export them.

## 8. API contract (P1 implements, P2 to P4 call)

All under `/api/dash`, JSON in and out, `export const dynamic = 'force-dynamic'`. Write requests (every POST, PUT, DELETE except `auth/nonce`) must send `content-type: application/json` (DELETE may send `{}`), and when an `Origin` header is present its host must equal the request host; otherwise 403 `forbidden`. Request bodies over 32 KiB give 400 `invalid`.

| Method and path | Body | Success body | Auth |
| :--- | :--- | :--- | :--- |
| POST `auth/nonce` | none | `{ nonce, message }` | none, IP rate limited |
| POST `auth/session` | `{ nonce, signature }` plus header `Authorization: Bearer <Privy access token>` | `SessionInfo`, sets cookie | Privy |
| GET `auth/session` | none | `SessionInfo` or 401 | cookie |
| DELETE `auth/session` | none | `{ ok: true }`, clears cookie | none |
| POST `widgets` | `{ widget: WidgetPayload, addTo?: { dashboard, size } }` | `WriteResult` with `key`, `expiresAt`, optional `linkKey` | cookie |
| PUT `widgets/<key>` | `{ widget: WidgetPayload }` | `WriteResult` | cookie, widget `user` |
| DELETE `widgets/<key>` | `{}` | `WriteResult` | cookie, widget `user` |
| POST `widgets/<key>/extend` | `{}` | `WriteResult` with `expiresAt` | cookie, widget `user` or owner of a live link to it |
| POST `dashboards` | `{ title, description? }` | `WriteResult` with `key`, `expiresAt` | cookie |
| PUT `dashboards/<key>` | `{ title, description? }` | `WriteResult` | cookie, dashboard `user` |
| DELETE `dashboards/<key>` | `{}` | `WriteResult` | cookie, dashboard `user` |
| POST `dashboards/<key>/organize` | `{ title?, items: { link: string \| null, widget, size }[] }` | `WriteResult` with `expiresAt` | cookie, dashboard `user` |
| POST `dashboards/<key>/links` | `{ widget, size }` | `WriteResult` with `linkKey` | cookie, dashboard `user` |

Errors: `{ error: DashErrorCode, message: string }` with status 400 `invalid`, 401 `unauthenticated`, 403 `forbidden`, 404 `not_found` (missing or expired), 409 `conflict` / `at_cap` / `full`, 429 `rate_limited` (plus `Retry-After` header), 503 `busy` / `disabled`, 502 `chain`. `afterBlock` is the chain head read before the write; the client treats a row as synced once local DuckDB shows it with `updated_at > afterBlock` (or absent, for deletes).

Session cookie: name `dash_session`, `HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`, plus `Secure` when the request URL is https. Value is `base64url(JSON Session) + '.' + base64url(HMAC-SHA256)`; the HMAC key is `HMAC-SHA256(key = PRIVY_APP_SECRET, data = 'arkiv-dash-session-v1')`.

Sign in message (exact, lines joined with `\n`):

```text
Sign in to Arkiv SQL dashboards
Domain: <request host>
Nonce: <nonce>
Issued at: <ISO 8601 time>
This signature proves you control this wallet. It costs nothing and sends no transaction.
```

Nonce: 32 random bytes as 64 lowercase hex chars, single use, 5 minute lifetime, kept in memory (one web container; documented limitation).

Rate limits (spec §10 leaves numbers to the builder): writes per session address 5 per minute and 40 per hour; all writes together 80 per hour (each write spends one `arkiv_query` on the web container's anonymous budget of about 100 per hour, SPECS.md §4; an RPC 429 maps to 503 `busy` with the upstream Retry-After); nonces per client IP (first `x-forwarded-for` entry, else `unknown`) 20 per minute; write queue holds at most 25 waiting jobs, then 503 `busy`.

## 9. Environment

| Variable | Where | Meaning |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_PRIVY_APP_ID` | web build arg and runtime env | Privy app id; blank disables the feature |
| `PRIVY_APP_SECRET` | web runtime env only | Privy app secret (user lookup, session HMAC key) |
| `DASHBOARD_PRIVATE_KEY` | web runtime env only | Backend wallet key that writes every entity. The owner reuses the demo "agent one" wallet; its address is the first entry of `DEMO_AGENT_ADDRESSES` |
| `NEXT_PUBLIC_DASHBOARD_WALLET` | web build arg and runtime env | Address of `DASHBOARD_PRIVATE_KEY`, the creator filter for every widget, dashboard and link read; the server refuses writes (503 `disabled`) when it does not match the key |
| `NEXT_PUBLIC_TIRAMISU_RPC_URL` | existing | Also used server side for dashboard reads and the wallet transport |

Secrets never reach the indexer or demo writer services, never appear in build args and never use a `NEXT_PUBLIC_` name. Server dashboard reads (`arkiv_query`) run without an API key on the web container's anonymous budget (about 100 queries per hour, SPECS.md §4); every write does at most two queries.

Next.js loads `.env*` files from the Next project directory (`apps/web`), not from the repository root (`apps/web/node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`). Local development with the root `.env.local` therefore needs the variables exported or the file linked into `apps/web`; plan 4 documents this in DEVELOPER.md.

## 10. Reads and freshness

- Payloads (widget config, link size and position, dashboard description) come only from Arkiv RPC by key (spec §8), via `lib/dash/read.ts` in the browser and `queryAll` on the server, always inside `scopeExpr(wallet)`.
- Lists, counts and activity come from local DuckDB through `lib/dash/sql.ts`.
- After a write, the client adds a pending write (P2) so lists and pages show the result before the index catches up; `SyncChip` shows "Syncing" until `useSynced` reports the row in DuckDB.
- Stored widget SQL from any user runs in the viewer's DuckDB only after `checkWidgetSql` passes, with at most 5,000 result rows.
