# Backend review fixes

Required reading: `CONTEXT.md` in this directory, then `01-backend-write-api.md` for the modules touched here.

Task 1 fixes four verified review findings against the plan 1 backend (`apps/web/lib/dash/server/*`). Task 2 is an owner decision: the dashboard wallet address is served by a Next.js API route instead of a `NEXT_PUBLIC_` build variable. One commit per task.

## Global Constraints

Same as `CONTEXT.md` section 2. Tests run offline with `bun test`.

---

### Task 1: Public origin check, real SDK revert matching, stricter SQL guard, nonce quota

**Files:**
- Modify: `apps/web/lib/dash/server/auth.ts`, `apps/web/lib/dash/server/nonce.ts`, `apps/web/lib/dash/server/operations.ts`, `apps/web/lib/dash/sql-guard.ts`, and the route or handler that calls `nonces.issue(domain)` (wherever the domain is computed today).
- Test: extend `apps/web/test/dash-auth.test.ts`, `apps/web/test/dash-server-primitives.test.ts`, `apps/web/test/dash-ops-widgets.test.ts`, `apps/web/test/dash-sql-guard.test.ts`.

**Interfaces:**
- Produces: `publicHost(req: Request): string` in `auth.ts`. Returns the first comma separated value of `x-forwarded-host`, else the `host` header, else `new URL(req.url).host`, lowercased and trimmed.
- Changes: `clientIp(req)` returns the LAST non empty entry of `x-forwarded-for` (the one appended by the deployment proxy), else `x-real-ip`, else `'unknown'`. IPv6 addresses are reduced to their /64 prefix (first four hextets, expanded) so one host cannot rotate keys inside its /64.
- Changes: `NonceStore.issue(domain, ip)` and a per IP quota. `NonceStore` options gain `perIp` (default 5 outstanding unexpired nonces per ip). When the ip already holds `perIp` outstanding nonces, its oldest nonce is dropped (only that ip's). When the store is at `max`, `issue` throws `dashErrors.busy()` instead of evicting other users' nonces.

Why (verified findings):
1. In the standalone container (`apps/web/Dockerfile` sets `HOSTNAME=0.0.0.0`), Next builds the route `req.url` from the listen hostname (`next/dist/server/lib/router-utils/resolve-routes.js:118`, `next/dist/server/web/spec-extension/adapters/next-request.js:90-97`), so `new URL(req.url).host` is `0.0.0.0:3000` and `assertWriteRequest` rejects every browser write with 403. The sign in message `Domain:` line also says `0.0.0.0:3000`.
2. Real SDK reverts read `Transaction failed: no entity 0xabcdef12…345678 — it may have been deleted, or have expired` or `Transaction failed: entity 0xabcdef12…345678 expired at block 123` (`@arkiv-network/sdk/src/utils/revert.ts:67-70,134-137`, `utils/arkivTransactions.ts:223-225`). The key is shortened with `…`, so the current regex never matches and the API returns 502 instead of 404. The demo writer also checks `error.cause?.data?.errorName` (`apps/demo-writer/src/writer.ts:22`).
3. `checkWidgetSql` accepts quoted identifiers, dollar quoting and `E''` strings that DuckDB executes, which smuggles file or URL reads and extra statements.
4. Global FIFO eviction lets one client flood nonces and evict everyone else's.

- [ ] **Step 1: Write the failing tests**

`dash-auth.test.ts`:
- `assertWriteRequest` accepts a request whose url is `http://0.0.0.0:3000/api/dash/session` with headers `host: app.example.com`, `origin: https://app.example.com`, `content-type: application/json`.
- Same url with `x-forwarded-host: app.example.com, internal`, `host: web:3000`, `origin: https://app.example.com` is accepted.
- Same url with `host: app.example.com`, `origin: https://evil.example` throws the forbidden error.
- The nonce issue handler for a request with url `http://0.0.0.0:3000/...` and `host: app.example.com` returns a message containing `Domain: app.example.com`.
- `clientIp` returns `203.0.113.9` for `x-forwarded-for: 1.2.3.4, 203.0.113.9`, and `2001:db8:1:2::/64` style key (`2001:0db8:0001:0002::/64`) for `x-forwarded-for: 2001:db8:1:2:aaaa::1`.

`dash-server-primitives.test.ts`:
- `NonceStore` with `perIp: 2`: three `issue(d, 'a')` calls leave the first nonce unconsumable and the second and third consumable; a nonce issued for `'b'` in between stays consumable.
- `NonceStore` with `max: 2`: a third `issue` from a third ip throws an error with the busy code, and both earlier nonces stay consumable.

`dash-ops-widgets.test.ts`:
- A fake wallet whose write throws `new Error('Transaction failed: no entity 0xabcdef12…345678 — it may have been deleted, or have expired')` maps to the not found error.
- Same for `Transaction failed: entity 0xabcdef12…345678 expired at block 123`.
- An error whose `cause` has `data.errorName === 'EntityNotFound'` (message unrelated) maps to not found.
- Replace the old synthetic message cases if they no longer represent SDK output.

`dash-sql-guard.test.ts`: each of these returns a non null reason:
- `SELECT * FROM "https://evil.example/x.csv"`
- `SELECT * FROM "read_csv"('a')`
- `SELECT * FROM "data.parquet"`
- `SELECT read_text($$https://evil/a$$)`
- `SELECT E'\'' ; INSTALL httpfs; SELECT E'\''`
- `SELECT $$'$$; ATTACH 'x.db'; SELECT $$'$$`
And these still return null: `SELECT "creator", count(*) AS "n" FROM entities GROUP BY 1`, `SELECT 'it''s' AS s`, `SELECT a."key" FROM entities a`.

- [ ] **Step 2: Run** `bun test ./apps/web/test/dash-auth.test.ts ./apps/web/test/dash-server-primitives.test.ts ./apps/web/test/dash-ops-widgets.test.ts ./apps/web/test/dash-sql-guard.test.ts`. Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**

- `assertWriteRequest` compares the Origin host with `publicHost(req)`. The nonce handler passes `publicHost(req)` as the domain and `clientIp(req)` as the ip, and the nonce rate limiter keys on the new `clientIp`.
- `write()` in `operations.ts` maps to not found when any error in the `cause` chain (depth 5) has `data?.errorName` or `errorName` in `EntityNotFound`, `EntityExpired`, or when the message matches `/no entity 0x|entity 0x\S+ expired at block|EntityNotFound|EntityExpired/i`.
- `sql-guard.ts`: reject (with a clear reason) any `$` dollar quote (`$$` or `$tag$`), any `E'`/`e'` escape string literal, and any double quoted identifier whose content is not `^[A-Za-z_][A-Za-z0-9_]*$`. Also check the unquoted, lowercased content of every double quoted identifier against the existing file function list. Keep standard `'...'` literals (with `''` escapes) as the only string form.

- [ ] **Step 4: Run** `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(web): public origin check, real Arkiv revert matching, stricter widget SQL guard and per IP nonce quota"
```

### Task 2: Serve the dashboard wallet address from the backend, drop `NEXT_PUBLIC_DASHBOARD_WALLET`

Owner decision (20 October 2026): the browser learns the dashboard wallet address from a Next.js API route. The address is derived from `DASHBOARD_PRIVATE_KEY` on the server, so there is one source of truth, no build argument, and no rebuild when the key changes. The indexer is not touched.

**Files:**
- Create: `apps/web/app/api/dash/config/route.ts` (`export const dynamic = 'force-dynamic'`).
- Modify: `apps/web/lib/dash/config.ts`, `apps/web/lib/dash/server/config.ts`, `apps/web/lib/dash/server/routes.ts` (add the handler), `apps/web/components/auth/DashAuthProvider.tsx`, every module that calls `publicDashConfig()` (`grep -rn publicDashConfig apps/web --include='*.ts' --include='*.tsx'`), `apps/web/Dockerfile`, `docker-compose.yml`, `docker-compose.dokploy.yml`, `.env.example`, `test/deployment.test.ts`, `docs/superpowers/plans/2026-10-20-widget-dashboards/CONTEXT.md` is already updated by the coordinator.
- Test: `apps/web/test/dash-routes.test.ts`, `apps/web/test/dash-auth.test.ts` (or the provider test that covers config), `test/deployment.test.ts`.

**Interfaces:**
- Produces: `handleDashConfig(deps: { config: ServerDashConfig | null }): Response`. `GET /api/dash/config` returns 200 `{ "wallet": "0x<lowercase address>" }` when the server config is valid, else 200 `{ "wallet": null }`. Cache header `Cache-Control: no-store`.
- Changes: `ServerDashConfig.wallet` is derived with `privateKeyToAccount(DASHBOARD_PRIVATE_KEY).address.toLowerCase()` (`viem/accounts`). Remove the "wallet must match key" check and every read of `NEXT_PUBLIC_DASHBOARD_WALLET`.
- Changes: `readPublicDashConfig(env: { privyAppId?: string; wallet?: string | null; rpcUrl?: string })` keeps its shape. `publicDashConfig()` is removed. New `fetchDashWallet(fetchImpl = fetch): Promise<string | null>` in `lib/dash/config.ts` calls `/api/dash/config` once per page load (module level promise cache; a failed request resolves null and is not cached).
- Changes: `DashAuthProvider` fetches the wallet on mount with `fetchDashWallet`, builds the config with `readPublicDashConfig({ privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID, wallet, rpcUrl: process.env.NEXT_PUBLIC_TIRAMISU_RPC_URL })`, and exposes it as `config: PublicDashConfig | null` on `useDashAuth()` (null while loading). Status is `loading` until the wallet request settles, then `disabled` when `enabled` is false. Every former `publicDashConfig()` caller reads `useDashAuth().config` instead and renders its loading state while it is null.

- [ ] **Step 1: Write the failing tests**
- `handleDashConfig({ config })` with a config built from the test key returns `{ wallet: <address of that key, lowercase> }` and `Cache-Control: no-store`; with `config: null` returns `{ wallet: null }`.
- Server config: for a valid `DASHBOARD_PRIVATE_KEY` and no `NEXT_PUBLIC_DASHBOARD_WALLET` in env, `wallet` equals the key's lowercase address.
- `fetchDashWallet` with a fake fetch returning `{ wallet: '0xABC...' }` (valid address) resolves the lowercase address, calls fetch once for two calls; a rejected fetch resolves null and the next call fetches again.
- `test/deployment.test.ts`: no file among `apps/web/Dockerfile`, `docker-compose.yml`, `docker-compose.dokploy.yml`, `.env.example`, `apps/web/lib`, `apps/web/components` contains `NEXT_PUBLIC_DASHBOARD_WALLET`.

- [ ] **Step 2: Run** the touched test files. Expected: FAIL.

- [ ] **Step 3: Implement** as described in Interfaces.

- [ ] **Step 4: Run** `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): serve the dashboard wallet address from an API route instead of a public build variable"
```
