# Frontend review fixes

Required reading: `CONTEXT.md` in this directory, then `02-login-and-widgets.md` Tasks 5, 7 and 8 for the modules touched here.

Fixes verified review findings against plan 2 (login bridge and widget page). One task, one commit.

## Global Constraints

Same as `CONTEXT.md` section 2. Tests run offline with `bun test`; interaction logic stays in pure functions that are tested directly.

---

### Task 1: Finish Privy OAuth after the redirect, silent cancel, widget page sync retry, no owner flash

**Files:**
- Modify: `apps/web/components/auth/DashAuthProvider.tsx`, `apps/web/components/auth/PrivyBridge.tsx`, `apps/web/components/widgets/WidgetPage.tsx` (and the pure helper module it uses for `widgetPageMode`, wherever that lives).
- Test: the existing auth UI test (`apps/web/test/dash-auth-ui.test.tsx`) and the widget page test file from plan 2 Task 8.

Why (verified findings):
1. Privy 3.50.0 OAuth (Google, Discord, X) leaves the page with `window.location.assign(url)` (`@privy-io/react-auth/dist/esm/index-CqvyXQur.mjs`, `initLoginWithOAuth`) and finishes only when `PrivyProvider` mounts and reads `privy_oauth_code`, `privy_oauth_state`, `privy_oauth_provider` from `location.search`. `DashAuthProvider` mounts `PrivyBridge` only while React state `mode` is set, which the reload resets, so OAuth login never completes.
2. Closing the Privy modal calls `useLogin` `onError` with `'exited_auth_flow'` (`errors-BQ3N-RVt.mjs`), which `PrivyBridge` maps to `'failed'`, so the user sees "Login didn't finish. Try again." instead of a silent cancel.
3. After create, `/widgets/<key>` shows `MissingWidget` ("expired") with no retry when the first RPC read does not see the new entity yet, even though a pending write for that key exists.
4. `widgetPageMode` picks viewer mode while auth is still `loading`, so the owner sees the read only preview flash and run its query before the editor replaces it.

**Interfaces:**
- Produces: `oauthReturnPending(search: string): boolean` exported from `DashAuthProvider.tsx` or a small helper next to it. True when the query string has both `privy_oauth_code` and `privy_oauth_state`.
- Produces: `bridgeErrorReason(error: unknown): 'cancelled' | 'failed'` in `PrivyBridge.tsx` (or a helper beside it). `'cancelled'` when the error is the string `'exited_auth_flow'` or an object whose `privyErrorCode`, `code` or `message` equals `'exited_auth_flow'`; otherwise `'failed'`.
- Produces: `widgetLoadState(input: { authStatus: string; widget: unknown | null; pending: boolean; attempts: number; loadError: boolean }): 'auth' | 'syncing' | 'missing' | 'error' | 'ready'` used by `WidgetPage`. Order: `authStatus === 'loading'` gives `'auth'`; widget present gives `'ready'`; no widget and `pending` and `attempts < 10` gives `'syncing'`; `loadError` and `attempts < 3` gives `'syncing'`; `loadError` gives `'error'`; else `'missing'`.

- [ ] **Step 1: Write the failing tests**
- `oauthReturnPending('?privy_oauth_code=a&privy_oauth_state=b&privy_oauth_provider=google')` is true; `''`, `'?privy_oauth_code=a'` and `'?x=1'` are false.
- `bridgeErrorReason('exited_auth_flow')` and `bridgeErrorReason({ privyErrorCode: 'exited_auth_flow' })` are `'cancelled'`; `bridgeErrorReason(new Error('boom'))` is `'failed'`.
- `widgetLoadState` cases for each branch above, including `{ authStatus: 'loading', widget: {...} }` giving `'auth'` and `{ widget: null, pending: true, attempts: 9 }` giving `'syncing'` while `attempts: 10` gives `'missing'`.
- Static render of `WidgetPage` body in the `'syncing'` state contains the UI §0 "Syncing" chip text and not "expired".

- [ ] **Step 2: Run** the touched test files. Expected: FAIL.

- [ ] **Step 3: Implement**
- `DashAuthProvider`: on mount (client only, inside an effect), when `oauthReturnPending(window.location.search)` is true and the config is enabled, set `mode = 'login'` so `PrivyBridge` mounts and Privy finishes the code exchange. The bridge must not call `login()` again in that case: pass a `resume` prop, and in resume mode the runner waits for `privy.ready && privy.authenticated` (then runs the existing handshake) or for 20 seconds (then `failed`). After the handshake settles, remove the three `privy_oauth_*` params from the URL with `history.replaceState` keeping other params and the hash.
- `PrivyBridge`: `useLogin` `onError` calls `fail(bridgeErrorReason(error))`.
- `WidgetPage`: render by `widgetLoadState`. `'auth'` renders the page loading state. `'syncing'` shows the widget name from the pending write (if any) with the "Syncing" chip and refetches every 2 seconds, incrementing `attempts`. `'missing'` and `'error'` keep today's UI.

- [ ] **Step 4: Run** `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(web): finish Privy OAuth after the redirect, silent cancel and sync retry on new widget pages"
```
