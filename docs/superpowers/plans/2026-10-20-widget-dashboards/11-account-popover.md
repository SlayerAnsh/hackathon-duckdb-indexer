# Login button and account popover

Required reading: `CONTEXT.md` in this directory, `09-live-dashboards-redesign.md` Task 1 (top bar shell), `10-user-owned-widgets.md` Tasks 2 and 4 (balance hook, `BalanceNotice`), and UI doc §10 and §11.

Owner decision (20 October 2026): the header button reads "Log in" instead of "Build your dashboard". When the user is logged in, the avatar opens a full account popover instead of the small two item menu. The header no longer shows the live chip (the status bar in the footer already shows it; the coordinator removed it from `TopBarView`). The landing hero link "Build your dashboard" stays as it is.

## Global Constraints

Same as `CONTEXT.md` section 2. Colors only through theme tokens (`var(--...)`), never hard coded (the existing color test enforces it). Tooltips on icon buttons use the `has-tip` class with `data-tip` (the class `tip` is the chart tooltip box and must not be used on buttons). No new dependencies.

## Review Focus

- Keyboard: Tab, Escape and arrow keys work in the popover; focus returns to the avatar button on close.
- Phone width (360px): the popover fits inside the viewport with a 16px gutter; it also renders inside the mobile nav sheet.
- Balance unknown (RPC down): the popover shows "Balance unavailable" and no warning, never a crash.
- Logout while the popover is open closes it and the header shows "Log in" again.

---

### Task 1: "Log in" button and account popover

**Files:**
- Modify: `apps/web/components/widgets/AccountButton.tsx`, `apps/web/components/widgets/AvatarMenu.tsx` (rename the export to `AccountPopover`, keep `menuIndex` and `PROVIDER_LABELS` exported), `apps/web/app/globals.css` (or `theme.css`, wherever the account styles live).
- Test: `apps/web/test/dash-auth-ui.test.tsx` and the existing avatar menu tests (update expectations from "Build your dashboard" to "Log in").

**Interfaces:**
- Consumes: `useDashAuth()` (`status`, `address`, `login`, `logout`, `requestLogin`, `confirming`, `config`), `useWalletBalance(address, rpcUrl)` from `lib/dash/use-balance.ts`, `formatGlm`, `balanceLevel` and `MIN_SIGNING_BALANCE_WEI` from `lib/dash/wallet.ts`, `addressUrl`-style helper in `lib/explorer.ts` (use the existing exported function that returns `${EXPLORER_URL}/address/<addr>`), `shortHex` from `lib/format.ts`.
- Produces: `AccountPopoverView(props: { address: string; login: Login; balance: { wei: bigint | null; level: BalanceLevel }; copied: boolean; onCopy(): void; onClose(): void; onLogout(): void; id?: string })`, a pure presentational component rendered by `AccountPopover`, which owns open state effects (focus first item, outside pointer close, Escape, arrow keys via `menuIndex`).

**Requirements:**
- Logged out: the button is `btn btn-outline` with a login icon (arrow into a door, 16px, stroke `currentColor`) and the text "Log in" (keep "Confirming…" while `confirming`). On click it calls `requestLogin()` and routes to `/me` on success, as today. Remove the `build-long`/`build-short` spans and their CSS.
- Logged in trigger: avatar dot with the provider glyph plus `shortHex(address)` and a chevron, `aria-haspopup="dialog"`, `aria-expanded`.
- Popover (`role="dialog"`, `aria-label="Account"`, width 300px, `max-width: calc(100vw - 32px)`, anchored under the trigger at the right, `--card` background, `--border-strong` border, `--r-lg` radius, `--shadow-pop`). Sections, top to bottom, separated by 1px `--border` lines:
  1. Identity: larger avatar dot (32px), "Signed in with <Provider>" and the address in mono with a copy icon button (`has-tip`, `data-tip` "Copy address", after copy "Copied" for 1.5s, announced through an `aria-live="polite"` span) and an external link icon to the address on the explorer (`target="_blank" rel="noreferrer"`, label "View on explorer").
  2. Balance: label "Balance", value `formatGlm(wei)` in mono; `level === 'low'` shows a `--warn` line "Below 0.1 GLM. Extending and deleting widgets may fail."; `level === 'empty'` shows a `--bad` line "No GLM. Fund this address to extend or delete widgets."; `wei === null` shows "Balance unavailable" in `--text-3b`.
  3. Links (menu items, 36px min height, 44px on touch): "My home" (`/me`), "New widget" (`/widgets/new`), "Explore" (`/explore`).
  4. "Log out" button item in `--text-2`, closes the popover and calls `logout()`.
- Keyboard: on open focus the copy button; Tab cycles within the popover is not required, but Escape closes and returns focus to the trigger; ArrowUp/ArrowDown/Home/End move across the link and logout items using `menuIndex`. Outside pointer down closes.
- Inside the mobile nav sheet the popover renders static (full width, no absolute positioning).

- [ ] **Step 1: Write the failing tests**
- Logged out static render of `AccountButton` (existing test harness) contains `Log in` and not `Build your dashboard`.
- `renderToStaticMarkup(<AccountPopoverView address="0x1111111111111111111111111111111111111111" login="google" balance={{ wei: 50000000000000000n, level: 'low' }} copied={false} .../>)` contains `Signed in with Google`, `0.05 GLM`, `Below 0.1 GLM`, `href="/me"`, `href="/widgets/new"`, `href="/explore"`, `Log out`, `role="dialog"`, and the explorer address URL.
- Same with `level: 'empty'`, `wei: 0n` contains `No GLM`; with `wei: null, level: 'unknown'` contains `Balance unavailable` and neither warning.
- `copied: true` contains `Copied`.
- No rendered markup in `AccountPopoverView` or `ThemeToggle` contains `class="tip"` or a class list with the bare word `tip` (regex `/class="([^"]* )?tip( [^"]*)?"/`).

- [ ] **Step 2: Run** the touched test files. Expected: FAIL.

- [ ] **Step 3: Implement** as described.

- [ ] **Step 4: Run** `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): log in button and full account popover with balance, copy and explorer link"
```

### Task 2: Designed empty states and SQL first lists

**Files:**
- Create: `apps/web/components/widgets/EmptyState.tsx`.
- Modify: `apps/web/components/explore/DashboardBrowse.tsx`, `apps/web/components/widgets/ExplorerGrid.tsx` (the Widgets tab), `apps/web/components/landing/OfficialDashboards.tsx`, `apps/web/components/widgets/HomePage.tsx` (My dashboards, My widgets, activity), the import modal empty result, and the styles file that holds the explore and home styles.
- Test: the existing explore, landing and home test files.

Why: owner feedback (20 October 2026) that empty states look unfinished (a bare sentence plus a button floating left of an empty page), and that finding dashboards and widgets must use the app's own indexer SQL because it is faster. The lists already query DuckDB (`dashboardListSql`, `widgetListSql`); the indexer does not store payloads, so RPC reads are only for payload fields (description, SQL, mapping). Cards must never wait on RPC to appear.

**Interfaces:**
- Produces: `EmptyState(props: { icon: 'dashboard' | 'widget' | 'search' | 'official' | 'activity'; title: string; body: string; actions?: ReactNode; compact?: boolean })`. Renders a `section` with `role="status"`, an inline 40px line icon in `--text-3` inside a 64px rounded square with `--card-2` background and 1px `--border-faint` border, the title (16px, 600, `--text`), the body (14px, `--text-2`, max 46ch), and the actions row. Centered, padding 48px 24px (24px 16px when `compact`), 1px dashed `--border` with `--r-lg` radius, full width of the list area. Uses theme tokens only.

**Requirements:**
- Explore, Dashboards tab, no dashboards at all: icon `dashboard`, title "No dashboards yet", body "Dashboards are public pages of live charts stored on Arkiv. Create one from your widgets or start from an official report." Actions: logged out, primary "Log in to create" (calls `requestLogin`, then `/me`); logged in, primary "New dashboard" (`/me?new=dashboard` if HomePage already reads a query flag, else `/me`); secondary `btn btn-quiet` "Browse widgets" switching to the Widgets tab.
- Explore, filters active with zero matches: icon `search`, title "No matches", body "Nothing matches “<search>”." (or "these filters" without a search), action "Clear filters".
- Widgets tab, no widgets: icon `widget`, title "No widgets yet", body "A widget is one SQL query with a chart. Write one in a minute; it runs on the live index in your browser.", primary "New widget" (`/widgets/new`, logged out goes through login as the route already does), secondary "Open playground".
- Landing, official dashboards missing: icon `official`, title "Official reports are on their way", body "Network reports kept live by this app will appear here. Meanwhile, explore what the community built.", actions "Explore dashboards" and "Open playground". Replace the current sentence "Official dashboards are not set up on this deployment yet."
- `/me`: My dashboards empty uses `dashboard` with "Create your first dashboard" and "New dashboard"; My widgets empty uses `widget` with "New widget"; activity empty uses `activity`, `compact`.
- Loading must not show an empty state: show skeleton cards while the SQL query has no data (`showLoading` from `lib/dash/loading.ts`).
- SQL first: dashboard and widget cards render from the DuckDB row immediately (title, owner, counts, chart type, expiry). Payload only fields (description, preview) fill in when the RPC read resolves and show a one line skeleton until then. An RPC failure leaves the card visible without the description.
- Replace the "0 dashboards, newest first" line with nothing when the total is zero.

- [ ] **Step 1: Write the failing tests**
- Static render of `EmptyState` contains the title, body, `role="status"`, and no hard coded color.
- Explore Dashboards view in the empty, logged out state contains "No dashboards yet" and "Log in to create" and not "0 dashboards"; with a search "abc" and zero results contains "No matches" and "Clear filters".
- Widgets tab empty contains "No widgets yet" and `href="/widgets/new"`.
- Landing official section empty contains "Official reports are on their way" and not "not set up on this deployment".
- A dashboard card rendered from a SQL row with no payload yet contains the title and a skeleton line, and does not contain an error.

- [ ] **Step 2: Run** the touched test files. Expected: FAIL.

- [ ] **Step 3: Implement** as described.

- [ ] **Step 4: Run** `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): designed empty states and lists that render from indexer SQL before payloads load"
```
