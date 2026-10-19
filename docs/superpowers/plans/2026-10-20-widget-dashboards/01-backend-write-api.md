# Widget dashboards plan 1: backend write API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Required Reading

1. `docs/superpowers/plans/2026-10-20-widget-dashboards/CONTEXT.md` (all sections; sections 5 to 9 are the contract this plan implements).
2. Spec sections 6, 7 and 8 of `docs/superpowers/specs/2026-10-20-widget-dashboards-design.md`.
3. `apps/demo-writer/src/writer.ts` and `apps/demo-writer/test/writer.test.ts` (SDK batch pattern and fake client).
4. `packages/core/src/rpc.ts`, `packages/core/src/query.ts`, `packages/core/src/decode.ts`.
5. `apps/web/app/data/[...path]/route.ts`, `apps/web/test/proxy.test.ts` (route handler and test style).

**Goal:** A tested server side write API in `apps/web` that authenticates Privy users with a personal_sign nonce, keeps a signed session cookie, validates widget, dashboard and link payloads, and writes them to Arkiv through one serial queue on the backend wallet.

**Architecture:** Isomorphic modules in `apps/web/lib/dash/` hold the schema, validation, SQL guard and entity decoding so the browser can reuse them. Server modules in `apps/web/lib/dash/server/` hold auth, limits, the queue and operations; every operation reads current state from Arkiv RPC (never the indexer) inside the queue slot, checks ownership, then sends one SDK call. Next.js route files under `apps/web/app/api/dash/` are one line wrappers around tested `handle*` functions.

**Tech Stack:** Next.js 16 route handlers, `@privy-io/node` 0.36.0, `@arkiv-network/sdk` 0.8.1, viem, `@asi/core` RPC client, Bun test.

**Spec:** `docs/superpowers/specs/2026-10-20-widget-dashboards-design.md`

## Global Constraints

- All of CONTEXT.md sections 2, 6, 8 and 9 apply verbatim.
- "attributes hold queryable information only. Layout and configuration (size, chart type, mapping, query text) live in the payload." (spec §6). The `chart` attribute is the one allowed duplicate.
- "no email address, social handle or Privy user id goes on chain" (spec §4). Only the embedded wallet address and the provider name are written.
- "Every app query for widgets and dashboards filters on `creator = <dashboard wallet>`" (spec §8).
- Extend: "by the widget's `lifetimeDays`, never past 90 days remaining" (spec §6.4).
- "Organize save (reorder, resize, import, remove): one `executeBatch`" (spec §6.4).
- No server side SQL (spec §3).

## Review Focus

1. Stored widget SQL that touches files, URLs or local tables (`COPY`, `read_parquet('https://x')`, `FROM 'https://x/a.parquet'`, `DELETE FROM merged_entities`, two statements) must be rejected with 400 `invalid`, because other viewers run it in their own DuckDB. Pinned in Task 2.
2. Two users writing at the same moment must both succeed in order (predicted keys depend on the wallet nonce), and a 26th waiting job gets 503 `busy`. Pinned in Task 4 and Task 6.
3. An extension that would not move the expiry later reverts the whole Arkiv transaction. Extend at the 90 day cap must answer 409 `at_cap` without sending, and organize must skip extensions for entities already at or past the target. Pinned in Task 6 and Task 7.
4. Imports or links that reference an expired or foreign widget (written by another wallet with the same attributes) must answer 404 `not_found` before any write. Pinned in Task 3 and Task 7.
5. A replayed nonce, a signature from a wallet not linked to the Privy user, or a tampered or expired cookie must give 401 and never a session. Pinned in Task 4 and Task 5.

---

### Task 1: Schema constants and payload validation

**Files:**
- Create: `apps/web/lib/dash/schema.ts`
- Test: `apps/web/test/dash-schema.test.ts`

**Interfaces:**
- Consumes: `checkWidgetSql` is not available yet; `parseWidgetPayload` takes an optional second parameter `checkSql?: (sql: string) => string | null` defaulting to a function returning null. Task 2 changes only the default to `checkWidgetSql`.
- Produces: everything listed for `lib/dash/schema.ts` in CONTEXT.md 7.1, plus `DashErrorCode`, `SessionInfo`, `WriteResult` types from CONTEXT.md 7.3.

- [ ] **Step 1: Write the failing tests** in `apps/web/test/dash-schema.test.ts`:

```ts
const valid = { v: 1, name: 'Top 10 creators', sql: 'SELECT creator, count(*) AS n FROM entities GROUP BY 1 ORDER BY n DESC LIMIT 10',
  chart: 'hbar', mapping: { x: 'creator', y: ['n'], groupBy: null, stacking: 'off', sort: 'query' }, counter: null,
  format: { number: '0,0', xTitle: null, yTitle: null, legend: true, labels: false, colors: {} }, lifetimeDays: 7 }

test('accepts the spec example and strips unknown keys', () => {
  const r = parseWidgetPayload({ ...valid, extra: 1, mapping: { ...valid.mapping, junk: true } })
  expect(r).toEqual({ ok: true, value: valid })
})
test('trims the name and rejects empty, long, control characters and over 128 UTF-8 bytes', () => {
  expect(parseWidgetPayload({ ...valid, name: '  Hi  ' })).toMatchObject({ ok: true, value: { name: 'Hi' } })
  for (const name of ['', '   ', 'x'.repeat(81), 'a\u0000b', 'é'.repeat(65)]) expect(parseWidgetPayload({ ...valid, name }).ok).toBe(false)
})
test('enforces enums', () => {
  for (const patch of [{ chart: 'scatter' }, { lifetimeDays: 14 }, { v: 2 }, { format: { ...valid.format, number: '0.000' } },
    { mapping: { ...valid.mapping, stacking: 'sideways' } }, { mapping: { ...valid.mapping, sort: 'random' } },
    { format: { ...valid.format, colors: { n: 'red' } } }]) expect(parseWidgetPayload({ ...valid, ...patch }).ok).toBe(false)
})
test('groupBy and several Y columns are mutually exclusive, Y has at most 8 columns', () => {
  expect(parseWidgetPayload({ ...valid, mapping: { ...valid.mapping, y: ['a', 'b'], groupBy: 'c' } }).ok).toBe(false)
  expect(parseWidgetPayload({ ...valid, mapping: { ...valid.mapping, y: Array.from({ length: 9 }, (_, i) => 'c' + i) } }).ok).toBe(false)
  expect(parseWidgetPayload({ ...valid, mapping: { ...valid.mapping, y: ['n'], groupBy: 'creator' } }).ok).toBe(true)
})
test('counter config is required for counter charts and null otherwise', () => {
  const counter = { column: 'n', row: 0, prefix: '', suffix: ' rows', label: 'Live', decimals: 0, compact: true }
  expect(parseWidgetPayload({ ...valid, chart: 'counter', counter }).ok).toBe(true)
  expect(parseWidgetPayload({ ...valid, chart: 'counter', counter: null }).ok).toBe(false)
  expect(parseWidgetPayload({ ...valid, counter }).ok).toBe(false)
  expect(parseWidgetPayload({ ...valid, chart: 'counter', counter: { ...counter, decimals: 7 } }).ok).toBe(false)
})
test('sql length and serialized size caps', () => {
  expect(parseWidgetPayload({ ...valid, sql: 'SELECT 1 ' + ' '.repeat(10000) }).ok).toBe(false)
  expect(parseWidgetPayload({ ...valid, sql: '   ' }).ok).toBe(false)
})
test('uses the injected SQL check', () => {
  expect(parseWidgetPayload(valid, () => 'nope')).toEqual({ ok: false, error: 'nope' })
})
test('dashboard and link payloads', () => {
  expect(parseDashboardPayload({ v: 1, title: ' Top creators ' })).toEqual({ ok: true, value: { v: 1, title: 'Top creators', description: '' } })
  expect(parseDashboardPayload({ v: 1, title: 'x', description: 'd'.repeat(501) }).ok).toBe(false)
  expect(parseLinkPayload({ v: 1, size: 'xl', position: 3, name: 'Top 10 creators' }).ok).toBe(true)
  for (const bad of [{ size: 'lg' }, { position: -1 }, { position: 1.5 }]) expect(parseLinkPayload({ v: 1, size: 'xl', position: 3, name: 'n', ...bad }).ok).toBe(false)
})
test('defaults and helpers', () => {
  expect(['counter', 'donut', 'bar', 'table'].map(c => defaultSize(c as ChartType))).toEqual(['xs', 'sm', 'md', 'md'])
  expect(SIZE_SPAN).toEqual({ xs: 3, sm: 4, md: 6, xl: 12 })
  expect(emptyWidget()).toMatchObject({ v: 1, chart: 'table', lifetimeDays: 7, mapping: { y: [], stacking: 'off', sort: 'query' } })
  expect(isEntityKey('0x' + 'ab'.repeat(32))).toBe(true); expect(isHexAddress('0x' + 'ab'.repeat(32))).toBe(false)
})
```

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-schema.test.ts`. Expected: FAIL, module `../lib/dash/schema` not found.

- [ ] **Step 3: Implement `apps/web/lib/dash/schema.ts`** with the exports in CONTEXT.md 7.1. Parsing rules: names and titles are trimmed, 1 to `LIMITS.name` characters, at most `LIMITS.attrBytes` UTF-8 bytes, no characters below U+0020; `sql` is trimmed for the emptiness check but stored as given, at most `LIMITS.sql` characters; column names (`x`, `y[]`, `groupBy`, `counter.column`, color keys) are 1 to `LIMITS.column` characters; axis titles are null or at most `LIMITS.axisTitle` characters; `description` defaults to `''`; integers via `Number.isInteger`; the parsed object is rebuilt field by field (unknown keys dropped) and `JSON.stringify(value)` must be at most `LIMITS.payloadBytes` bytes. Error strings are short and name the field, for example `name must be 1 to 80 characters`.

- [ ] **Step 4: Run** the same command. Expected: PASS.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/schema.ts apps/web/test/dash-schema.test.ts
git commit -m "feat(web): widget, dashboard and link payload schema with validation"
```

### Task 2: Widget SQL guard

**Files:**
- Create: `apps/web/lib/dash/sql-guard.ts`
- Modify: `apps/web/lib/dash/schema.ts` (default `checkSql` becomes `checkWidgetSql`)
- Test: `apps/web/test/dash-sql-guard.test.ts`

**Interfaces:**
- Produces: `checkWidgetSql(sql: string): string | null`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('allows read only queries over the public views', () => {
  for (const sql of ['SELECT count(*) FROM entities', 'with t as (select 1 as x) select * from t;',
    "SELECT name, count(*) FROM attributes WHERE value = 'COPY; DROP' GROUP BY 1", '-- note: delete\nSELECT 1',
    'SELECT * FROM entities e JOIN attributes a USING (key) WHERE a.name = \'read_parquet\'',
    "SELECT 'it''s' AS s", 'SELECT updated_at AS "set" FROM entities']) expect(checkWidgetSql(sql)).toBeNull()
})
test('rejects statements other than one SELECT or WITH', () => {
  for (const sql of ['', 'DELETE FROM merged_entities', 'SELECT 1; SELECT 2', 'INSERT INTO live_head VALUES (1)',
    'PRAGMA version', 'SET threads = 1', 'ATTACH \'x.db\'', 'INSTALL httpfs', 'LOAD httpfs', 'CALL pragma_version()',
    'SELECT 1; DROP TABLE base_entities', 'COPY entities TO \'out.csv\'', 'WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x'])
    expect(checkWidgetSql(sql)).not.toBeNull()
})
test('rejects file and network access', () => {
  for (const sql of ["SELECT * FROM read_parquet('https://evil/x.parquet')", "SELECT * FROM 'https://evil/x.parquet'",
    "SELECT * FROM read_csv_auto('/etc/passwd')", "SELECT * FROM 'data.csv'", "SELECT * FROM glob('*')",
    "SELECT * FROM parquet_metadata('x')", "SELECT getenv('HOME')", "SELECT * FROM sqlite_scan('a', 'b')"])
    expect(checkWidgetSql(sql)).not.toBeNull()
})
```

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-sql-guard.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `checkWidgetSql`.** Tokenize once: remove `--` line comments and `/* */` block comments; collect single quoted literals (with `''` escapes) and replace each with a placeholder; replace double quoted identifiers with a placeholder. Then on the remaining text: allow at most one trailing `;` and no other `;`; the first word must be `SELECT` or `WITH`; reject any whole word (case insensitive) in `INSERT UPDATE DELETE MERGE CREATE DROP ALTER ATTACH DETACH COPY EXPORT IMPORT INSTALL LOAD SET RESET PRAGMA CALL CHECKPOINT VACUUM TRUNCATE USE BEGIN COMMIT ROLLBACK`; reject identifiers starting with `read_`, `parquet_`, `iceberg_`, `delta_`, `sqlite_`, `postgres_`, `mysql_` and the names `glob`, `getenv`, `query_table`, `query`; reject any collected string literal that contains `://`, starts with `/` or `~`, or ends in `.parquet`, `.csv`, `.tsv`, `.json`, `.jsonl`, `.ndjson`, `.txt`, `.db` or `.duckdb` (case insensitive). Return reasons such as `Only one SELECT or WITH query is allowed`, `Widgets cannot modify data`, `Widgets cannot read files or URLs`. Then set it as the default `checkSql` in `parseWidgetPayload`.

- [ ] **Step 4: Run** `bun test ./apps/web/test/dash-sql-guard.test.ts ./apps/web/test/dash-schema.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/sql-guard.ts apps/web/lib/dash/schema.ts apps/web/test/dash-sql-guard.test.ts
git commit -m "feat(web): read only guard for stored widget SQL"
```

### Task 3: Entity decoding, expressions and public config

**Files:**
- Create: `apps/web/lib/dash/entities.ts`, `apps/web/lib/dash/config.ts`
- Test: `apps/web/test/dash-entities.test.ts`

**Interfaces:**
- Consumes: Task 1 parse functions; `decodeAttribute`, `keyChunkQueries`, `ArkivRpc`, `RpcSelect`, `RpcEntity` from `@asi/core`; `addr`, `key` from `@arkiv-network/sdk/attr`; `eq`, `and`, `or`, `render` from `@arkiv-network/sdk/query`.
- Produces: `lib/dash/entities.ts` and `lib/dash/config.ts` exactly as CONTEXT.md 7.1.

- [ ] **Step 1: Write the failing tests.** Build RPC rows the way Arkiv returns them (attributes `{ name, type, value }`, numbers as hex quantities, payload as `0x` hex of UTF-8 JSON):

```ts
const W = '0x' + '1a'.repeat(20), U = '0x' + '2b'.repeat(20), K = '0x' + '11'.repeat(32), D = '0x' + '22'.repeat(32)
const hex = (v: object) => '0x' + Buffer.from(JSON.stringify(v)).toString('hex')
const row = (over: object = {}) => ({ key: K.toUpperCase().replace('0X', '0x'), owner: W, creator: W, createdAt: '0x10', updatedAt: '0x20', expiresAt: '0x30',
  attributes: [{ name: 'type', type: 'str', value: 'widget' }, { name: 'project', type: 'str', value: 'arkiv-sql-indexer-dash' },
    { name: 'user', type: 'addr', value: U.toUpperCase().replace('0X', '0x') }, { name: 'login', type: 'str', value: 'google' },
    { name: 'name', type: 'str', value: 'Top' }, { name: 'chart', type: 'str', value: 'hbar' }], payload: hex(validWidget), ...over })

test('decodes a widget with lowercase hex and numeric blocks', () => {
  const w = asWidget(decodeDashEntity(row() as any), W)!
  expect(w).toMatchObject({ kind: 'widget', key: K, user: U, login: 'google', name: 'Top', chart: 'hbar', createdAt: 16, updatedAt: 32, expiresAt: 48 })
  expect(w.widget.sql).toBe(validWidget.sql)
})
test('rejects foreign creators, wrong project, bad payloads and type mismatches', () => {
  expect(asWidget(decodeDashEntity(row({ creator: U }) as any), W)).toBeNull()
  expect(asWidget(decodeDashEntity(row({ payload: '0x7b' }) as any), W)).toBeNull()
  expect(decodeDashEntity(row({ payload: '0x7b' }) as any).payload).toBeNull()
  expect(asDashboard(decodeDashEntity(row() as any), W)).toBeNull()
})
test('expressions scope every read to the dashboard wallet and project', () => {
  expect(scopeExpr(W)).toBe(render(and(eq('$creator', addr(W)), eq('project', 'arkiv-sql-indexer-dash'))))
  expect(scopeExpr(W)).toContain(`$creator = addr(${W})`)
  expect(dashboardBundleExpr(W, D)).toContain(`$key = key(${D})`)
  expect(dashboardBundleExpr(W, D)).toContain(`dashboard = key(${D})`)
  expect(widgetExtendExpr(W, K, U)).toContain(`user = addr(${U})`)
  expect(keysExprs(W, Array.from({ length: 51 }, (_, i) => '0x' + i.toString(16).padStart(64, '0')))).toHaveLength(2)
})
test('queryAll follows cursors and reports the first page block', async () => {
  const pages = [{ data: [row()], blockNumber: 100, cursor: 'c1' }, { data: [row({ key: D })], blockNumber: 101 }]
  const calls: any[] = []
  const rpc = { query: async (expression: string, opts: any) => { calls.push(opts); return pages.shift()! } }
  const result = await queryAll(rpc as any, 'x')
  expect(result.head).toBe(100); expect(result.entities.map(e => e.key)).toEqual([K, D])
  expect(calls.map(c => c.cursor)).toEqual([undefined, 'c1']); expect(calls[0].limit).toBe(200); expect(calls[0].select).toEqual(DASH_SELECT)
})
test('public config is enabled only with an app id and a valid wallet', () => {
  expect(readPublicDashConfig({ privyAppId: 'app', wallet: W.toUpperCase().replace('0X', '0x') })).toEqual({ enabled: true, privyAppId: 'app', wallet: W, rpcUrl: 'https://rpc.tiramisu.db-chain.testnet.arkiv.network' })
  expect(readPublicDashConfig({ privyAppId: '', wallet: W }).enabled).toBe(false)
  expect(readPublicDashConfig({ privyAppId: 'app', wallet: 'nope' }).enabled).toBe(false)
})
```

Also cover `asDashboard` and `asLink` with one valid row each (link attributes `dashboard` and `widget` typed `key`).

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-entities.test.ts`. Expected: FAIL, modules not found.

- [ ] **Step 3: Implement both modules** per CONTEXT.md 7.1. `decodeDashEntity` converts block fields with `clampBlock` from `@asi/core` and builds `attrs` from `decodeAttribute(...).value`. Payload decode: strip `0x`, hex to bytes, `TextDecoder('utf-8', { fatal: true })`, `JSON.parse`, null on any error. `asWidget` does not compare the `chart` attribute with the payload (the payload wins; the attribute only serves SQL counts). Expression builders use the SDK `eq/and/or/render` with `addr()` and `key()` values; never concatenate user input by hand.

- [ ] **Step 4: Run** the test file. Expected: PASS. Run the type check (CONTEXT.md §3). Expected: clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/entities.ts apps/web/lib/dash/config.ts apps/web/test/dash-entities.test.ts
git commit -m "feat(web): decode dashboard entities from Arkiv RPC with creator scoped queries"
```

### Task 4: Server primitives: errors, session cookie, nonces, rate limits, write queue

**Files:**
- Create: `apps/web/lib/dash/server/errors.ts`, `session.ts`, `nonce.ts`, `rate-limit.ts`, `queue.ts`
- Test: `apps/web/test/dash-server-primitives.test.ts`

**Interfaces:**
- Produces:

```ts
// errors.ts
export class DashError extends Error { constructor(code: DashErrorCode, status: number, message: string, retryAfterSec?: number) }
export const dashErrors: { invalid(m: string): DashError; unauthenticated(): DashError; forbidden(m?: string): DashError; notFound(m?: string): DashError;
  conflict(code: 'conflict' | 'at_cap' | 'full', m: string): DashError; rateLimited(retryAfterSec: number): DashError; busy(retryAfterSec?: number): DashError; disabled(m?: string): DashError }
export function json(body: unknown, init?: ResponseInit): Response
export function errorResponse(error: unknown): Response   // DashError -> its status and { error, message } (+ Retry-After); anything else -> 502 { error: 'chain', message: 'Arkiv write failed. Try again.' } and console.error of error.message only
// session.ts
export const SESSION_COOKIE = 'dash_session'
export const SESSION_TTL_SECONDS = 28800
export function deriveSessionSecret(appSecret: string): Buffer
export function signSession(session: Session, secret: Buffer): string
export function verifySession(token: string, secret: Buffer, nowSec: number): Session | null
export function sessionCookie(token: string, secure: boolean): string
export function clearSessionCookie(secure: boolean): string
export function readCookie(req: Request, name: string): string | null
// nonce.ts
export function signInMessage(domain: string, nonce: string, issuedAt: string): string
export class NonceStore { constructor(opts?: { ttlMs?: number; max?: number; now?: () => number }); issue(domain: string): { nonce: string; message: string }; consume(nonce: string): { message: string } | null }
// rate-limit.ts
export type Rule = { limit: number; windowMs: number }
export const WRITE_RULES: Rule[]; export const GLOBAL_WRITE_RULES: Rule[]; export const NONCE_RULES: Rule[]
export class RateLimiter { constructor(rules: Rule[], now?: () => number); take(id: string): { ok: true } | { ok: false; retryAfterSec: number } }
// queue.ts
export class WriteQueue { constructor(maxWaiting?: number); readonly waiting: number; run<T>(work: () => Promise<T>): Promise<T> }
```

- [ ] **Step 1: Write the failing tests:**

```ts
test('session round trip, tamper, expiry and cookie flags', () => {
  const secret = deriveSessionSecret('app-secret')
  const token = signSession({ address: '0x' + 'ab'.repeat(20), login: 'x', exp: 2000 }, secret)
  expect(verifySession(token, secret, 1999)).toEqual({ address: '0x' + 'ab'.repeat(20), login: 'x', exp: 2000 })
  expect(verifySession(token, secret, 2000)).toBeNull()
  expect(verifySession(token.slice(0, -2) + 'AA', secret, 1)).toBeNull()
  expect(verifySession(token, deriveSessionSecret('other'), 1)).toBeNull()
  expect(verifySession('garbage', secret, 1)).toBeNull()
  expect(sessionCookie(token, true)).toBe(`dash_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800; Secure`)
  expect(clearSessionCookie(false)).toBe('dash_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')
  expect(readCookie(new Request('http://h', { headers: { cookie: 'a=1; dash_session=tok' } }), 'dash_session')).toBe('tok')
})
test('nonces are single use and expire after five minutes', () => {
  let now = 0
  const store = new NonceStore({ now: () => now })
  const a = store.issue('arkiv-sql.example')
  expect(a.nonce).toMatch(/^[0-9a-f]{64}$/)
  expect(a.message.split('\n')).toEqual(['Sign in to Arkiv SQL dashboards', 'Domain: arkiv-sql.example', `Nonce: ${a.nonce}`,
    'Issued at: 1970-01-01T00:00:00.000Z', 'This signature proves you control this wallet. It costs nothing and sends no transaction.'])
  expect(store.consume(a.nonce)).toEqual({ message: a.message }); expect(store.consume(a.nonce)).toBeNull()
  const b = store.issue('h'); now = 300_001; expect(store.consume(b.nonce)).toBeNull()
})
test('rate limiter applies every rule and reports retry after', () => {
  let now = 0
  const limiter = new RateLimiter([{ limit: 2, windowMs: 60_000 }, { limit: 3, windowMs: 3_600_000 }], () => now)
  expect(limiter.take('a').ok).toBe(true); expect(limiter.take('a').ok).toBe(true)
  expect(limiter.take('a')).toEqual({ ok: false, retryAfterSec: 60 }); expect(limiter.take('b').ok).toBe(true)
  now = 60_000; expect(limiter.take('a').ok).toBe(true); now = 120_000; expect(limiter.take('a').ok).toBe(false)
  expect(WRITE_RULES).toEqual([{ limit: 5, windowMs: 60_000 }, { limit: 40, windowMs: 3_600_000 }])
  expect(GLOBAL_WRITE_RULES).toEqual([{ limit: 80, windowMs: 3_600_000 }]); expect(NONCE_RULES).toEqual([{ limit: 20, windowMs: 60_000 }])
})
test('write queue runs jobs one at a time in order and rejects when full', async () => {
  const queue = new WriteQueue(2), order: string[] = []
  let release!: () => void
  const first = queue.run(() => new Promise<void>(r => { order.push('a start'); release = () => { order.push('a end'); r() } }))
  const second = queue.run(async () => { order.push('b') })
  const third = queue.run(async () => { order.push('c') })
  await expect(queue.run(async () => {})).rejects.toMatchObject({ code: 'busy', status: 503 })
  release(); await Promise.all([first, second, third])
  expect(order).toEqual(['a start', 'a end', 'b', 'c'])
  await expect(queue.run(async () => { throw new Error('x') })).rejects.toThrow('x')
  await expect(queue.run(async () => 7)).resolves.toBe(7)
})
test('error responses never leak raw errors', async () => {
  const r = errorResponse(new Error('private key 0xabc'))
  expect(r.status).toBe(502); expect(await r.json()).toEqual({ error: 'chain', message: 'Arkiv write failed. Try again.' })
  const limited = errorResponse(dashErrors.rateLimited(30))
  expect(limited.status).toBe(429); expect(limited.headers.get('retry-after')).toBe('30')
})
```

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-server-primitives.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the five modules.** Use `node:crypto` (`createHmac`, `randomBytes`, `timingSafeEqual`). `WriteQueue.waiting` counts jobs not yet finished minus the running one; `run` throws `dashErrors.busy()` when `waiting >= maxWaiting` (default 25); a failed job never blocks later jobs. `RateLimiter` keeps a timestamp list per id, prunes entries older than the longest window, and only records a hit when every rule passes; `retryAfterSec` is the ceiling of the time until the oldest blocking hit leaves its window. `NonceStore` default `ttlMs` 300000 and `max` 10000 (drops expired entries first, then the oldest).

- [ ] **Step 4: Run** the test file. Expected: PASS.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/server apps/web/test/dash-server-primitives.test.ts
git commit -m "feat(web): session cookie, nonce store, rate limits and serial write queue"
```

### Task 5: Server config, Privy verification and auth handlers

**Files:**
- Create: `apps/web/lib/dash/server/config.ts`, `apps/web/lib/dash/server/privy.ts`, `apps/web/lib/dash/server/auth.ts`
- Test: `apps/web/test/dash-auth.test.ts`

**Interfaces:**
- Consumes: Task 4 modules; `recoverMessageAddress` from `viem`; `privateKeyToAccount` from `viem/accounts`; `import type { PrivyClient, User } from '@privy-io/node'` (types only in this file).
- Produces:

```ts
// config.ts
export type ServerDashConfig = { privyAppId: string; privyAppSecret: string; privateKey: `0x${string}`; wallet: string; rpcUrl: string; sessionSecret: Buffer }
export function readServerDashConfig(env: Record<string, string | undefined>): { ok: true; config: ServerDashConfig } | { ok: false; reason: string }
// privy.ts
export type PrivyIdentity = { userId: string; wallets: string[]; login: Login | null }
export interface PrivyVerifier { verify(accessToken: string): Promise<PrivyIdentity> }
export function identityFromUser(user: Pick<User, 'id' | 'linked_accounts'>): PrivyIdentity
export function createPrivyVerifier(client: Pick<PrivyClient, 'utils' | 'users'>): PrivyVerifier
// auth.ts
export type AuthDeps = { config: Pick<ServerDashConfig, 'sessionSecret'>; privy: PrivyVerifier; nonces: NonceStore; nonceLimiter: RateLimiter; now: () => number }
export function clientIp(req: Request): string
export function isSecure(req: Request): boolean
export function assertWriteRequest(req: Request): void          // throws forbidden or invalid per CONTEXT.md 8
export function readJson(req: Request): Promise<unknown>         // 32 KiB cap, invalid JSON -> dashErrors.invalid
export function requireSession(req: Request, deps: Pick<AuthDeps, 'config' | 'now'>): Session
export function handleNonce(req: Request, deps: AuthDeps): Promise<Response>
export function handleCreateSession(req: Request, deps: AuthDeps): Promise<Response>
export function handleGetSession(req: Request, deps: AuthDeps): Promise<Response>
export function handleDeleteSession(req: Request): Promise<Response>
```

- [ ] **Step 1: Write the failing tests.** Use a real signer: `const account = privateKeyToAccount(('0x' + '42'.repeat(32)) as Hex)`; fake `PrivyVerifier` returning `{ userId: 'did:privy:1', wallets: [account.address.toLowerCase()], login: 'google' }` for token `good` and throwing for others.

```ts
test('server config needs every value and a matching wallet, and never echoes secrets', () => {
  const key = '0x' + '42'.repeat(32), address = privateKeyToAccount(key as Hex).address
  const env = { NEXT_PUBLIC_PRIVY_APP_ID: 'app', PRIVY_APP_SECRET: 's3cret', DASHBOARD_PRIVATE_KEY: key, NEXT_PUBLIC_DASHBOARD_WALLET: address }
  expect(readServerDashConfig(env)).toMatchObject({ ok: true, config: { wallet: address.toLowerCase(), rpcUrl: 'https://rpc.tiramisu.db-chain.testnet.arkiv.network' } })
  for (const missing of Object.keys(env)) expect(readServerDashConfig({ ...env, [missing]: '' }).ok).toBe(false)
  const mismatch = readServerDashConfig({ ...env, NEXT_PUBLIC_DASHBOARD_WALLET: '0x' + '11'.repeat(20) })
  expect(mismatch).toMatchObject({ ok: false }); expect(JSON.stringify(mismatch)).not.toContain('42424242'); expect(JSON.stringify(mismatch)).not.toContain('s3cret')
})
test('identity takes ethereum embedded wallets and the most recently verified supported login', () => {
  const user = { id: 'did:privy:1', linked_accounts: [
    { type: 'wallet', wallet_client_type: 'privy', connector_type: 'embedded', chain_type: 'ethereum', address: '0xABCabcABCabcABCabcABCabcABCabcABCabcABCa' },
    { type: 'wallet', wallet_client_type: 'metamask', connector_type: 'injected', chain_type: 'ethereum', address: '0x' + '99'.repeat(20) },
    { type: 'google_oauth', latest_verified_at: 10 }, { type: 'twitter_oauth', latest_verified_at: 20 }, { type: 'email', latest_verified_at: 30 }] }
  expect(identityFromUser(user as any)).toEqual({ userId: 'did:privy:1', wallets: ['0xabcabcabcabcabcabcabcabcabcabcabcabcabca'], login: 'x' })
  expect(identityFromUser({ id: 'u', linked_accounts: [{ type: 'email' }] } as any).login).toBeNull()
})
test('nonce endpoint is rate limited per IP', async () => { /* 20 POSTs from x-forwarded-for 1.2.3.4 succeed with { nonce, message } containing "Domain: web.test"; the 21st is 429 with Retry-After; another IP still works */ })
test('session creation verifies token, signer, linked wallet and single use nonce', async () => {
  // issue nonce, sign its message with account, POST { nonce, signature } with Authorization: Bearer good
  // expect 200 { address: account.address.toLowerCase(), login: 'google' } and a Set-Cookie starting with 'dash_session='
  // replaying the same nonce -> 401; missing or bad bearer -> 401; signature by another key -> 401;
  // privy identity with login null -> 403; privy identity whose wallets do not include the signer -> 401
})
test('get and delete session', async () => {
  // GET with the cookie from the previous test -> 200 SessionInfo; GET without cookie -> 401; GET after now passes exp -> 401
  // DELETE -> 200 { ok: true } with Set-Cookie 'dash_session=; ...Max-Age=0'
})
test('write requests need JSON and a same origin', () => {
  expect(() => assertWriteRequest(new Request('https://web.test/api/dash/widgets', { method: 'POST', headers: { 'content-type': 'text/plain' } }))).toThrow()
  expect(() => assertWriteRequest(new Request('https://web.test/api/dash/widgets', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.test' } }))).toThrow()
  expect(() => assertWriteRequest(new Request('https://web.test/api/dash/widgets', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', origin: 'https://web.test' } }))).not.toThrow()
})
```

Write the bodies of the three commented tests as real assertions with exactly the expectations stated in their comments.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-auth.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** `readServerDashConfig` requires all four variables, a 32 byte hex key, derives the address with `privateKeyToAccount`, compares lowercase to `NEXT_PUBLIC_DASHBOARD_WALLET`, and returns reasons that name variables only (for example `NEXT_PUBLIC_DASHBOARD_WALLET does not match DASHBOARD_PRIVATE_KEY`). `identityFromUser` maps `google_oauth` to `google`, `discord_oauth` to `discord`, `twitter_oauth` to `x`, `telegram` to `telegram`, choosing the highest `latest_verified_at` (null counts as 0). `createPrivyVerifier` calls `client.utils().auth().verifyAccessToken(token)` then `client.users()._get(user_id)` (CONTEXT.md §5). `handleCreateSession` order: rate limit is not applied here; require bearer (401), parse body `{ nonce, signature }` (400), `consume` nonce (401 if null), `privy.verify` (401 on throw), `recoverMessageAddress({ message, signature })` (401 on throw), signer in `wallets` (401), `login` non null (403 `Use Google, Discord, X or Telegram to log in.`), then sign the session with `exp = now/1000 + SESSION_TTL_SECONDS` and respond with `Set-Cookie`. The domain in the message is `new URL(req.url).host`. Every handler wraps its body in `try { } catch (e) { return errorResponse(e) }`.

- [ ] **Step 4: Run** the test file and the type check. Expected: PASS and clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/server/config.ts apps/web/lib/dash/server/privy.ts apps/web/lib/dash/server/auth.ts apps/web/test/dash-auth.test.ts
git commit -m "feat(web): Privy access token plus personal_sign login with a signed session cookie"
```

### Task 6: Widget operations

**Files:**
- Create: `apps/web/lib/dash/server/operations.ts`
- Test: `apps/web/test/dash-ops-widgets.test.ts`, shared fakes in `apps/web/test/dash-fakes.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4; `ExpirationTime` from `@arkiv-network/sdk`; `addr`, `key` from `@arkiv-network/sdk/attr`; types `WalletArkivClient`, `PublicArkivClient`.
- Produces:

```ts
export type DashWriterClient = Pick<WalletArkivClient, 'account' | 'createEntity' | 'patchEntity' | 'extendEntity' | 'deleteEntity' | 'executeBatch'> & Pick<PublicArkivClient, 'predictEntityKeys'>
export type DashReader = Pick<ArkivRpc, 'query' | 'blockNumber'>
export type OpsDeps = { client: DashWriterClient; reader: DashReader; wallet: string; queue: WriteQueue }
export function extendTarget(expiresAt: number, head: number, lifetimeDays: number): number
export function widgetAttributes(w: WidgetPayload, s: Session): AttributeInputs   // { type: 'widget', project, user: addr(s.address), login: s.login, name: w.name, chart: w.chart }
export function createWidget(deps: OpsDeps, s: Session, input: { widget: WidgetPayload; addTo?: { dashboard: string; size: Size } }): Promise<WriteResult>
export function updateWidget(deps: OpsDeps, s: Session, key: string, widget: WidgetPayload): Promise<WriteResult>
export function extendWidget(deps: OpsDeps, s: Session, key: string): Promise<WriteResult>
export function deleteWidget(deps: OpsDeps, s: Session, key: string): Promise<WriteResult>
```

`apps/web/test/dash-fakes.ts` exports `fakeChain(entities: RpcRow[], head = 1000)` returning `{ deps: OpsDeps; calls: { method: string; data: any }[]; queries: string[] }`. Its reader answers every `query(expression)` with all stored rows and `blockNumber: head`, and records the expression in `queries`. Operations therefore must pick results by key and attributes themselves (the dashboard is the entity whose key is the requested key, links are `asLink` results whose `dashboardKey` or `widgetKey` and `user` match), which also defends against an over broad query; its client records calls like `apps/demo-writer/test/writer.test.ts` and returns `{ txHash: '0xtx', entityKey: predicted[0], createdEntities: [...], expiresAt: 0n }`; `predictEntityKeys` returns keys `0x..a1`, `0x..a2` with salts 1n, 2n. Also export row builders `widgetRow`, `dashboardRow`, `linkRow`.

- [ ] **Step 1: Write the failing tests** (`S = { address: U, login: 'google', exp: 9e9 }`):

```ts
test('extend target adds the lifetime but caps at 90 days remaining', () => {
  expect(extendTarget(1000 + 43200, 1000, 7)).toBe(1000 + 8 * 43200)
  expect(extendTarget(1000 + 89 * 43200, 1000, 7)).toBe(1000 + 90 * 43200)
})
test('create widget without a dashboard is one createEntity with attributes and JSON payload', async () => {
  const { deps, calls } = fakeChain([])
  const r = await createWidget(deps, S, { widget: validWidget })
  expect(calls.map(c => c.method)).toEqual(['create'])
  expect(calls[0].data.attributes).toEqual({ type: 'widget', project: 'arkiv-sql-indexer-dash', user: addr(U), login: 'google', name: 'Top 10 creators', chart: 'hbar' })
  expect(calls[0].data.contentType).toBe('application/json')
  expect(JSON.parse(new TextDecoder().decode(calls[0].data.payload))).toEqual(validWidget)
  expect(calls[0].data.expires).toEqual(ExpirationTime.fromSeconds(7 * 86400))
  expect(r).toMatchObject({ txHash: '0xtx', afterBlock: 1000 })
})
test('create with add to dashboard is one batch: predicted widget key referenced by the link, link lives as long as the dashboard', async () => {
  const { deps, calls } = fakeChain([dashboardRow({ key: D, user: U, expiresAt: 5000 }), linkRow({ dashboard: D, position: 4 })])
  const r = await createWidget(deps, S, { widget: validWidget, addTo: { dashboard: D, size: 'xl' } })
  expect(calls.map(c => c.method)).toEqual(['batch'])
  const [w, l] = calls[0].data.creates
  expect(w.salt).toBe(1n); expect(l.salt).toBe(2n)
  expect(l.attributes).toEqual({ type: 'link', project: 'arkiv-sql-indexer-dash', user: addr(U), dashboard: key(D), widget: key(PREDICTED_1) })
  expect(JSON.parse(new TextDecoder().decode(l.payload))).toEqual({ v: 1, size: 'xl', position: 5, name: 'Top 10 creators' })
  expect(l.expires).toEqual(ExpirationTime.atBlock(5000n))
  expect(r.key).toBe(PREDICTED_1); expect(r.linkKey).toBe(PREDICTED_2)
})
test('add to dashboard refuses a missing, foreign or full dashboard before writing', async () => {
  // missing D -> not_found; dashboard user is someone else -> forbidden; 48 links -> 409 full; calls stay empty in all three
})
test('update keeps lifetime, patches payload and attributes, owner only', async () => {
  // existing widgetRow(K, user U). updateWidget -> one 'patch' with entityKey K, set { name, chart } from the new payload (and only those), payload bytes, contentType
  // a widget owned by another user -> forbidden; missing -> not_found
})
test('extend: creator or owner of a live link may extend, capped, never past 90 days', async () => {
  // creator: one 'extend' with expires ExpirationTime.atBlock(BigInt(extendTarget(expiresAt, 1000, lifetimeDays))); result.expiresAt equals the target
  // stranger with a link row (user = stranger, widget = K) -> allowed; stranger without -> forbidden
  // widget already at head + 90 days -> 409 at_cap and no call; missing widget -> not_found
})
test('delete is owner only', async () => { /* owner -> one 'delete' { entityKey: K }; other -> forbidden */ })
test('reads and writes happen inside the queue', async () => {
  // with a WriteQueue whose first job is held open, a createWidget call does not query the reader until the held job finishes
})
```

Fill in the commented tests with exactly the stated expectations.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-ops-widgets.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Every exported operation is `deps.queue.run(async () => { ...read... ...check... ...write... })`. Reads use `queryAll` with the expressions from `entities.ts` and the `as*` validators with `deps.wallet`; entities whose `as*` returns null count as missing. `afterBlock` is the `head` of the read (or `await deps.reader.blockNumber()` when no read is needed). Ownership compares lowercase addresses. `createWidget` with `addTo` reads `dashboardBundleExpr(wallet, dashboard)`, requires the dashboard, `user === s.address` (403), live links fewer than `MAX_LINKS_PER_DASHBOARD` (409 `full`), position `max(position) + 1` (0 when none), then `predictEntityKeys({ owner: deps.client.account!.address, count: 2 })` and one `executeBatch`. `extendWidget` reads `widgetExtendExpr(wallet, key, s.address)`, and returns `expiresAt: target`. An `RpcError` with status 429 from a read becomes `dashErrors.busy()` carrying the upstream `retryAfter` as `retryAfterSec`. All SDK errors propagate to `errorResponse` (502), except: map SDK errors whose message matches `/EntityNotFound|EntityExpired|No live entity with key|entity 0x[\da-f]+ expired/i` (the demo writer's `isGone` pattern, `apps/demo-writer/src/writer.ts:16-27`) to `dashErrors.notFound()`.

- [ ] **Step 4: Run** the test file and the type check. Expected: PASS and clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/server/operations.ts apps/web/test/dash-ops-widgets.test.ts apps/web/test/dash-fakes.ts
git commit -m "feat(web): widget create, edit, extend and delete through the serial Arkiv write queue"
```

### Task 7: Dashboard operations and the organize batch

**Files:**
- Modify: `apps/web/lib/dash/server/operations.ts`
- Test: `apps/web/test/dash-ops-dashboards.test.ts`

**Interfaces:**
- Consumes: Task 6 (`OpsDeps`, fakes).
- Produces:

```ts
export type OrganizeItem = { link: string | null; widget: string; size: Size }
export type OrganizeInput = { title?: string; items: OrganizeItem[] }
export function parseOrganizeInput(input: unknown): Parsed<OrganizeInput>      // items array 0..48, keys valid, sizes valid, title optional (dashboard title rules)
export type OrganizePlan = { creates: { widget: string; size: Size; position: number; name: string }[]; patches: { link: string; size: Size; position: number; name: string }[];
  deletes: string[]; extend: string[]; target: number; title?: string }
export function planOrganize(state: { head: number; dashboard: DashboardEntity; links: LinkEntity[]; widgets: Map<string, WidgetEntity> }, input: OrganizeInput): OrganizePlan
export function createDashboard(deps: OpsDeps, s: Session, input: { title: string; description?: string }): Promise<WriteResult>
export function updateDashboard(deps: OpsDeps, s: Session, key: string, input: { title: string; description?: string }): Promise<WriteResult>
export function deleteDashboard(deps: OpsDeps, s: Session, key: string): Promise<WriteResult>
export function organizeDashboard(deps: OpsDeps, s: Session, key: string, input: OrganizeInput): Promise<WriteResult>
export function addLink(deps: OpsDeps, s: Session, dashboardKey: string, input: { widget: string; size: Size }): Promise<WriteResult>
```

- [ ] **Step 1: Write the failing tests** (pure `planOrganize` first, then the operations against `fakeChain`):

```ts
test('planOrganize renumbers in item order and only patches changed links', () => {
  const state = { head: 1000, dashboard: dash({ expiresAt: 1000 + 10 * 43200 }), links: [link('L1', 'W1', 0, 'md'), link('L2', 'W2', 1, 'md'), link('L3', 'W3', 2, 'sm')],
    widgets: new Map([['W4', widget('W4', 'New one')]]) }
  const plan = planOrganize(state, { items: [{ link: 'L2', widget: 'W2', size: 'md' }, { link: 'L1', widget: 'W1', size: 'xl' }, { link: null, widget: 'W4', size: 'xs' }] })
  expect(plan.target).toBe(1000 + 90 * 43200)
  expect(plan.patches).toEqual([{ link: 'L2', size: 'md', position: 0, name: 'W2 name' }, { link: 'L1', size: 'xl', position: 1, name: 'W1 name' }])
  expect(plan.creates).toEqual([{ widget: 'W4', size: 'xs', position: 2, name: 'New one' }])
  expect(plan.deletes).toEqual(['L3'])
  expect(plan.extend).toEqual([DASH_KEY, 'L2', 'L1'])
})
test('planOrganize rejects foreign links, duplicate widgets, missing or expired imports and more than 48 items', () => {
  // item.link not among state.links -> invalid; same widget twice -> conflict; new widget not in state.widgets -> not_found; 49 items -> full
})
test('planOrganize skips extensions for entities already at or past the target', () => {
  // dashboard.expiresAt === head + 90*43200 -> plan.extend excludes the dashboard key; a kept link with that expiry is excluded too
})
test('organizeDashboard sends one batch mirroring the plan, new links expire at the target', async () => {
  // fakeChain with the dashboard (user U), links L1..L3 and widget W4; call organizeDashboard
  // expect calls to be exactly ['batch'] with creates (attributes type link, user addr(U), dashboard key(D), widget key(W4); expires ExpirationTime.atBlock(BigInt(target))),
  // patches (entityKey, payload with new size and position), deletes [{ entityKey: 'L3' }], extensions for plan.extend each atBlock(target)
  // with a title in the input, patches also include the dashboard with set { title } and its new payload
  // the reader received one dashboardBundleExpr query that also lists the imported widget keys (extraKeys)
})
test('organize by a non owner is forbidden and nothing is written', async () => {})
test('create, rename and delete dashboards', async () => {
  // create -> one 'create' with attributes { type: 'dashboard', project, user: addr(U), login: 'google', title }, payload { v: 1, title, description: '' }, expires ExpirationTime.fromSeconds(90 * 86400)
  // update -> one 'patch' with set { title } and payload; non owner -> forbidden
  // delete -> one 'batch' with deletes [dashboard, every link of it]
})
test('addLink appends at the end with the dashboard expiry and refuses duplicates', async () => {
  // creates one link: position max+1, name from the widget attribute, expires atBlock(dashboard.expiresAt)
  // widget already on the dashboard -> 409 conflict; expired or foreign widget -> not_found; dashboard full -> 409 full
})
```

Fill in the commented tests with the stated expectations; `link`, `widget`, `dash` are small builders in the test file producing `LinkEntity`, `WidgetEntity`, `DashboardEntity`.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-ops-dashboards.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** `planOrganize` sets `target = head + DASHBOARD_LIFETIME_DAYS * BLOCKS_PER_DAY`; positions are the item index; a kept link is patched when its size or position changed; names of existing links stay as stored, names of new links come from the widget entity's `name` attribute (never from the client); `extend` lists the dashboard then every kept link in item order whose `expiresAt < target`. `organizeDashboard` reads `dashboardBundleExpr(wallet, key, newWidgetKeys)` once, builds the widgets map from entities that pass `asWidget`, runs `planOrganize`, and sends a single `executeBatch` with `creates`, `patches` (links, plus the dashboard when `title` is set), `deletes`, `extensions`; when the batch would be empty (no change and nothing to extend) it returns `{ txHash: '', afterBlock: head }` without sending. `deleteDashboard` deletes the dashboard and all its live links in one batch.

- [ ] **Step 4: Run** both ops test files and the type check. Expected: PASS and clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/server/operations.ts apps/web/test/dash-ops-dashboards.test.ts
git commit -m "feat(web): dashboard create, rename, delete, link and one batch organize save"
```

### Task 8: Route handlers, production deps and API route files

**Files:**
- Create: `apps/web/lib/dash/server/routes.ts`, `apps/web/lib/dash/server/deps.ts`
- Create: `apps/web/app/api/dash/auth/nonce/route.ts`, `apps/web/app/api/dash/auth/session/route.ts`, `apps/web/app/api/dash/widgets/route.ts`, `apps/web/app/api/dash/widgets/[key]/route.ts`, `apps/web/app/api/dash/widgets/[key]/extend/route.ts`, `apps/web/app/api/dash/dashboards/route.ts`, `apps/web/app/api/dash/dashboards/[key]/route.ts`, `apps/web/app/api/dash/dashboards/[key]/organize/route.ts`, `apps/web/app/api/dash/dashboards/[key]/links/route.ts`
- Test: `apps/web/test/dash-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 4 to 7.
- Produces:

```ts
// deps.ts
export type DashDeps = AuthDeps & { ops: OpsDeps; writeLimiter: RateLimiter; globalLimiter: RateLimiter }
export function buildDashDeps(config: ServerDashConfig): DashDeps        // PrivyClient, createWalletClient(tiramisu, privateKeyToAccount, http(rpcUrl)) merged with createPublicClient().predictEntityKeys like apps/demo-writer/src/main.ts:44-46, createRpc(rpcUrl) reader, new WriteQueue(25), limiters from rate-limit.ts, Date.now
export function getDashDeps(): DashDeps | { disabled: string }           // memoized on globalThis.__dashDeps from process.env via readServerDashConfig
// routes.ts: each returns Promise<Response>; `deps` may be the disabled marker, which gives 503 { error: 'disabled' }
export function withDeps(deps: DashDeps | { disabled: string }, fn: (deps: DashDeps) => Promise<Response>): Promise<Response>
export function handleCreateWidget(req: Request, deps: DashDeps): Promise<Response>
export function handleUpdateWidget(req: Request, deps: DashDeps, key: string): Promise<Response>
export function handleDeleteWidget(req: Request, deps: DashDeps, key: string): Promise<Response>
export function handleExtendWidget(req: Request, deps: DashDeps, key: string): Promise<Response>
export function handleCreateDashboard(req: Request, deps: DashDeps): Promise<Response>
export function handleUpdateDashboard(req: Request, deps: DashDeps, key: string): Promise<Response>
export function handleDeleteDashboard(req: Request, deps: DashDeps, key: string): Promise<Response>
export function handleOrganize(req: Request, deps: DashDeps, key: string): Promise<Response>
export function handleAddLink(req: Request, deps: DashDeps, key: string): Promise<Response>
```

- [ ] **Step 1: Write the failing tests** using `fakeChain` ops and a real signed cookie from Task 4:

```ts
test('every write handler checks request shape, session, rate limits, then validates', async () => {
  // no cookie -> 401; cookie ok but content-type text/plain -> 403 or 400 per assertWriteRequest; foreign origin -> 403
  // invalid widget payload -> 400 { error: 'invalid' } and no SDK call; malformed key path param ('0x12') -> 400
  // sixth write within a minute for one address -> 429 with Retry-After; another address still passes
  // global limiter exhausted -> 429
})
test('create widget returns the write result as JSON', async () => { /* 200 { txHash: '0xtx', afterBlock: 1000, key, expiresAt? } */ })
test('domain errors map to status codes', async () => { /* forbidden 403, not_found 404, at_cap 409, busy 503, unknown SDK throw 502 with the generic message */ })
test('disabled deps answer 503 disabled', async () => {
  const r = await withDeps({ disabled: 'NEXT_PUBLIC_PRIVY_APP_ID is not set' }, async () => new Response('x'))
  expect(r.status).toBe(503); expect(await r.json()).toEqual({ error: 'disabled', message: 'Dashboards are not enabled on this deployment.' })
})
test('route files are thin and force dynamic', async () => {
  // import each app/api/dash/**/route.ts module and assert `dynamic === 'force-dynamic'` and the expected method exports exist
})
```

Spell out each commented test with the stated expectations. Rate limiting uses the session address for `writeLimiter` and the constant id `all` for `globalLimiter`, checked in that order, before payload parsing.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-routes.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Handler order: `assertWriteRequest`, `requireSession`, limiters, `readJson`, validate (`parseWidgetPayload`, `parseDashboardPayload` for title and description, `parseOrganizeInput`, `isEntityKey` for path params and body keys, `SIZES` for sizes), call the operation, `json(result)`; catch with `errorResponse`. Route files follow `apps/web/app/data/[...path]/route.ts`: `export const dynamic = 'force-dynamic'` and, for example in `widgets/[key]/route.ts`:

```ts
export async function PUT(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  return withDeps(getDashDeps(), deps => handleUpdateWidget(req, deps, key))
}
```

`auth/session/route.ts` exports `GET`, `POST`, `DELETE`; `auth/nonce/route.ts` exports `POST`. `deps.ts` is the only module that imports the `PrivyClient` value and the SDK client factories; keep it out of tests except the import smoke test (constructing nothing at import time).

- [ ] **Step 4: Run** `bun test ./apps/web/test` and the type check. Expected: every web test passes, type check clean.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add apps/web/lib/dash/server/routes.ts apps/web/lib/dash/server/deps.ts apps/web/app/api/dash apps/web/test/dash-routes.test.ts
git commit -m "feat(web): dashboard API routes with auth, limits and validation"
```

### Task 9: Environment, compose, Dockerfile and deployment checks

**Files:**
- Modify: `.env.example`, `docker-compose.yml`, `docker-compose.dokploy.yml`, `apps/web/Dockerfile`, `test/deployment.test.ts`

**Interfaces:**
- Consumes: CONTEXT.md §9.
- Produces: the four variables wired into the `web` service only.

- [ ] **Step 1: Extend `test/deployment.test.ts` first** (failing):
  - In the compose test: `s.web.environment.PRIVY_APP_SECRET === '${PRIVY_APP_SECRET:-}'`, `s.web.environment.DASHBOARD_PRIVATE_KEY === '${DASHBOARD_PRIVATE_KEY:-}'`, `s.web.environment.NEXT_PUBLIC_PRIVY_APP_ID === '${NEXT_PUBLIC_PRIVY_APP_ID:-}'`, `s.web.environment.NEXT_PUBLIC_DASHBOARD_WALLET === '${NEXT_PUBLIC_DASHBOARD_WALLET:-}'`, and `s.web.build.args` has the same two `NEXT_PUBLIC_` values; for `indexer` and `demo-writer`, `JSON.stringify(service)` contains neither `DASHBOARD_PRIVATE_KEY` nor `PRIVY_APP_SECRET`; for every service, `JSON.stringify(service.build.args ?? {})` contains neither secret name.
  - In the images test: the web Dockerfile contains `ARG NEXT_PUBLIC_PRIVY_APP_ID=`, `ENV NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID`, `ARG NEXT_PUBLIC_DASHBOARD_WALLET=`, `ENV NEXT_PUBLIC_DASHBOARD_WALLET=$NEXT_PUBLIC_DASHBOARD_WALLET`, and does not contain `DASHBOARD_PRIVATE_KEY` or `PRIVY_APP_SECRET`; `.env.example` contains `NEXT_PUBLIC_PRIVY_APP_ID=`, `PRIVY_APP_SECRET=`, `DASHBOARD_PRIVATE_KEY=`, `NEXT_PUBLIC_DASHBOARD_WALLET=`.

- [ ] **Step 2: Run** `bun test ./test/deployment.test.ts`. Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement.** Add the four entries to `web.environment` and the two `NEXT_PUBLIC_` entries to `web.build.args` in both compose files (identical, the dokploy equality test must still pass). In `apps/web/Dockerfile` add the two `ARG`/`ENV` pairs beside the existing ones (blank defaults). In `.env.example` append a commented block (no dash punctuation):

```dotenv
# Widget dashboards (optional). Blank NEXT_PUBLIC_PRIVY_APP_ID turns the feature off.
NEXT_PUBLIC_PRIVY_APP_ID=
# Server only. Never prefix these with NEXT_PUBLIC_.
PRIVY_APP_SECRET=
# Backend wallet that writes every widget, dashboard and link. Use a funded synthetic testnet wallet only.
DASHBOARD_PRIVATE_KEY=
# Address of DASHBOARD_PRIVATE_KEY. Every widget and dashboard read filters on this creator.
NEXT_PUBLIC_DASHBOARD_WALLET=
```

- [ ] **Step 4: Run** `bun test ./test/deployment.test.ts ./apps/web/test`. Expected: PASS.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add .env.example docker-compose.yml docker-compose.dokploy.yml apps/web/Dockerfile test/deployment.test.ts
git commit -m "chore(deploy): wire Privy and dashboard wallet settings into the web service only"
```
