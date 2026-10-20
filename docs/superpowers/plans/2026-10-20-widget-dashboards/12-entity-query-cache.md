# Entity query cache with TanStack Query

Required reading: `CONTEXT.md` in this directory (sections 2, 3, 4, 7 and 10), then `lib/dash/read.ts`, `lib/dash/entities.ts`, `lib/rpc-browser.ts`.

Owner decision (20 October 2026): entity reads over the Arkiv RPC (widget payloads, dashboard bundles, dashboard metadata) must be cached with TanStack Query instead of being fetched again on every page visit, index tick or reload. `@tanstack/react-query@5.104.1` and `@tanstack/react-query-persist-client@5.104.1` are already installed in `apps/web` (do not add other dependencies, do not run any install).

## Global Constraints

Same as `CONTEXT.md` section 2. Read the installed sources under `node_modules/@tanstack/query-core`, `node_modules/@tanstack/react-query` and `node_modules/@tanstack/react-query-persist-client` for every API you use; do not rely on memory. Browser reads keep going through `createBrowserRpc` (the same origin keyed proxy). Server code under `lib/dash/server` does not change. Never cache an error result to disk.

## Review Focus

- An entity edited, extended, transferred or deleted by the current user shows the new state right after the write, never the cached old state.
- Rate limited RPC (`RpcError` with a quota or rate limit message) is not retried in a loop and keeps the last good cached data on screen.
- IndexedDB unavailable (private mode, blocked storage, thumbnail capture): the app works with the in memory cache only, no thrown errors.
- Two components asking for overlapping key sets in the same tick send one batched RPC request per missing key set, not one per component and not one per key.
- Logout or switching the dashboard wallet config never shows entities cached under another wallet.

---

### Task 1: Query client, persistence, batched entity loaders, and every read call site migrated

**Files:**
- Create: `apps/web/components/QueryProvider.tsx` (client component), `apps/web/lib/dash/entity-cache.ts`, `apps/web/lib/dash/query-persist.ts`.
- Modify: `apps/web/app/layout.tsx` (wrap the existing shell inside `QueryProvider`, outermost client provider that does not break `DashAuthProvider`), `apps/web/lib/dash/sql.ts` (add `updated_at` to the widget and dashboard list rows and items), `apps/web/lib/dash/use-widget-list.ts`, `apps/web/lib/dash/use-dashboard.ts`, `apps/web/components/explore/DashboardBrowse.tsx`, `apps/web/components/landing/OfficialDashboards.tsx`, `apps/web/components/widgets/HomePage.tsx`, `apps/web/components/widgets/OrganizeBoard.tsx`, `apps/web/components/widgets/WidgetPage.tsx`, and the write success paths that today call `addPending` or refetch (find them with `git grep -n "addPending\|setRefresh" apps/web/components apps/web/lib`).
- Test: new `apps/web/test/entity-cache.test.ts`; update the existing tests of the modules above when a signature changes.

**Interfaces:**
- Consumes: `fetchWidgets(rpc, wallet, keys)`, `fetchDashboards(rpc, wallet, keys)`, `fetchDashboardBundle(rpc, wallet, key)` from `lib/dash/read.ts`; `createBrowserRpc(url)`; `RpcError` and `rpcMessage` (find their modules).
- Produces, in `lib/dash/entity-cache.ts`:
  - `entityKeys = { widget(wallet: string, key: string): readonly unknown[]; dashboard(wallet: string, key: string): readonly unknown[]; bundle(wallet: string, key: string): readonly unknown[] }`. Keys are `['arkiv', kind, wallet.toLowerCase(), key.toLowerCase()]`. The entity revision is not part of the key; it is stored next to the data (see rev below).
  - `type Rev = string` built by `entityRev(e: { updatedAt: number; expiresAt: number; owner: string }): Rev` as `${updatedAt}:${expiresAt}:${owner.toLowerCase()}`.
  - `createEntityLoader(opts: { client: QueryClient; fetchMany(keys: string[]): Promise<Map<string, unknown>>; kind: 'widget' | 'dashboard'; wallet: string; schedule?(fn: () => void): void })` returning `load(keys: string[], want?: Map<string, Rev>): Promise<Map<string, unknown | null>>`. It answers from the cache when a cached entry exists and either no rev is wanted or the cached rev equals the wanted rev; collects every other key requested in the same tick (default `schedule` is `queueMicrotask`), calls `fetchMany` once for the union, writes each result with `client.setQueryData` (a key missing from the result is cached as `null`, meaning missing or expired), and resolves every caller.
  - Hooks: `useWidgetEntities(keys: string[], revs?: Map<string, Rev>): { data: Map<string, WidgetEntity | null> | undefined; error?: string; refetch(): void }`, `useDashboardEntities(keys, revs?)` with the same shape for `DashboardEntity`, `useWidgetEntity(key: string | null): { data: WidgetEntity | null | undefined; error?: string; limited: boolean; refetch(): void }`, `useDashboardBundle(key: string | null)` returning the current `use-dashboard.ts` bundle shape plus `refetch`.
  - `invalidateEntity(client: QueryClient, wallet: string, kind: 'widget' | 'dashboard' | 'bundle', key: string): Promise<void>` and `patchCachedWidget(client, wallet, key, patch: Partial<WidgetEntity>): void` for optimistic owner and expiry changes after a write.
- Produces, in `lib/dash/query-persist.ts`: `createIdbPersister(opts?: { dbName?: string; storeName?: string; key?: string }): Persister` (the `Persister` interface from the installed persist client: `persistClient`, `restoreClient`, `removeClient`), using raw `indexedDB` with every call wrapped in try/catch and resolving to undefined on any failure.
- Produces, in `components/QueryProvider.tsx`: `QueryProvider({ children })` that creates one `QueryClient` per browser session and uses `PersistQueryClientProvider` with the IndexedDB persister, `maxAge` 24 hours, `buster` equal to a constant `ENTITY_CACHE_VERSION = 'v1'` exported from `entity-cache.ts`, and `dehydrateOptions.shouldDehydrateQuery` that persists only successful queries whose key starts with `'arkiv'`.

**Requirements:**
- Default query options: `staleTime: Infinity` for entity queries (freshness comes from revs and explicit invalidation), `gcTime` 24 hours, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `retry`: at most 2 for transient errors and 0 for `RpcError` whose message says quota, budget or rate limit (check how `rpcMessage` classifies them and reuse that). `placeholderData: keepPreviousData` style behavior where lists change, so cards never blank out while a new key set loads.
- Revs: the SQL list rows (`widgetListSql`, `dashboardListSql`, and the dashboard bundle widget keys from links) carry `updated_at`, `expires_at` and owner. Pass a rev map to the hooks so an entity whose index row changed is fetched again, and an unchanged one is served from cache (memory or IndexedDB) with zero RPC calls. For `useWidgetEntity` on `/widgets/<key>` (no SQL row at first), serve the cached value immediately and revalidate once in the background when the page mounts if the cache entry is older than 60 seconds.
- Dashboard bundle (`fetchDashboardBundle`): cache per dashboard key with `staleTime` 30 seconds; the widgets it references go through the widget loader so a widget already cached from Explore is not fetched again.
- Writes: after a successful save, extend, delete, transfer, add to dashboard, organize Done or new dashboard, call `patchCachedWidget` for the fields known locally (owner, expiresAt, payload) and `invalidateEntity` for the affected keys (the widget, the dashboard bundle, and the dashboard metadata). Keep the existing `addPending` logic; it covers the index lag, the cache covers RPC reads.
- Wallet scope: keys include the dashboard wallet. On logout, do not clear entity data (it is public), but the auth dependent views must not read user specific data from it.
- Replace every manual `useEffect` plus `fetchWidgets` or `fetchDashboards` or `fetchDashboardBundle` pattern in the files listed above with the hooks. Keep each component's props and rendered states (loading, error with `rpcMessage`, Try again) unchanged; Try again calls `refetch`.
- `WidgetPage.tsx` keeps its existing load state machine (`widgetLoadState`, syncing, limited error handling) but reads through `useWidgetEntity`; the 2 second syncing retry becomes a `refetchInterval` that is active only in the syncing state and stops on a limited error.

- [ ] **Step 1: Write the failing tests** in `apps/web/test/entity-cache.test.ts` (bun:test, offline, a real `QueryClient` from the installed package, an injected `fetchMany` spy, an injected synchronous or manual `schedule`):
  - two `load` calls in the same tick for `['a','b']` and `['b','c']` call `fetchMany` once with the three keys, and both resolve with their own keys;
  - a second `load(['a'])` after the first resolves calls `fetchMany` zero times;
  - `load(['a'], new Map([['a', 'rev2']]))` after `a` was cached with rev1 fetches `a` again; with rev1 it does not;
  - a key absent from the `fetchMany` result is cached as `null` and is not fetched again on the next `load`;
  - `fetchMany` rejecting leaves earlier cached entries intact and rejects only the pending callers;
  - `entityRev({ updatedAt: 5, expiresAt: 9, owner: '0xAB' })` is `'5:9:0xab'`;
  - `invalidateEntity` followed by `load` fetches again;
  - `createIdbPersister()` with `globalThis.indexedDB` undefined resolves `restoreClient()` to undefined and `persistClient()` without throwing;
  - the dehydrate filter persists a successful `['arkiv','widget',...]` query and rejects an errored one and a non `arkiv` key.
  - Update `test/dash-explore.test.tsx` and the widget list tests for the new `updated_at` column in `toDashboardItems` and `toListItems` (append it as the last column so existing indexes stay valid).

- [ ] **Step 2: Run** `bun test ./apps/web/test/entity-cache.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** as described.

- [ ] **Step 4: Run** `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: all pass, clean. Then `git grep -n "fetchWidgets\|fetchDashboards\|fetchDashboardBundle\|fetchWidget(" apps/web/components apps/web/lib` must show calls only inside `lib/dash/read.ts`, `lib/dash/entity-cache.ts` and `lib/dash/server/`.

- [ ] **Step 5: Commit** (coordinator)

```bash
git commit -m "feat(web): cache entity reads with TanStack Query, batched per tick and persisted to IndexedDB"
```
