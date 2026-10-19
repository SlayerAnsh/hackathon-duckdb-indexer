# Widget dashboards: design

Date: 20 October 2026. Status: awaiting owner approval.

Marking: lines tagged **(user)** were decided by the project owner. Lines tagged **(call)** are the designer's call and may be changed by the owner. Untagged lines are facts about the existing code.

## 1. Intent

Today anyone landing on the app sees fixed analytics and runs SQL over the indexed Arkiv data in their own browser. This feature lets a visitor log in, save their own queries as charts ("widgets"), and arrange widgets into shareable dashboards.

Why it matters: widgets and dashboards are stored as Arkiv entities. The indexer then indexes the app's own data, which exercises the schema and live entity story (expiry, extension, batch writes, cross entity references) with real user content instead of only synthetic demo data. It also fills the unimplemented SPECS.md goal 10 ("Saved queries stored as Arkiv entities").

## 2. Goals

1. Privy login with Google, Discord, X and Telegram. **(user)**
2. A Widget is the main unit: one SQL query, one chart type, a data mapping, format options, and a lifetime the creator picks. **(user)** The name "Widget" is user facing. **(user)**
3. A Dashboard is an ordered list of widget references, each with a size (xs, sm, md, xl). Dashboards can import any widget, including widgets made by other users, with their own size per dashboard. **(user)**
4. Everything is public. Anyone with a link can view any dashboard or widget without logging in. Login exists only to stop abuse of the backend wallet. **(user)**
5. Dashboard home for a logged in user shows their activity, their dashboards, and a button to create a new dashboard. **(user)**
6. Widgets expire. An Extend button adds time. Anyone who owns a dashboard containing the widget may extend it, as may the widget creator. **(user)** An expired widget is not computed. **(user)**
7. Users never hold tokens or pay gas. The backend wallet writes every entity. **(user)**

## 3. Non goals

- No cell coordinates, grid positions or free layout. Order plus size only. **(user)**
- No private dashboards or widgets. **(user)**
- No combo or mixed charts, no right Y axis, no log scale, no scatter, no multiple charts per query, no per series chart type in v1. **(call, owner did not object)**
- No backend copy of widget queries. When a widget expires its query is gone. **(call)**
- No server side SQL. Queries keep running in the browser through DuckDB WASM, as today.

## 4. Anti goals (failure even if it works)

- Personal data on chain. Entity attributes are public; no email address, social handle or Privy user id goes on chain. **(call)**
- A user editing, deleting or reordering something they do not own.
- The backend wallet drained or flooded by one account.
- The existing logged out experience getting slower or more cluttered. The landing, showcase and playground stay as they are apart from one nav button. **(user)** Overridden by owner decision, 20 October 2026: the showcase is removed and Official dashboards replace it on the landing page (9.8); `/showcase` redirects to `/explore`. The v5 theme applies to every page (9.10). The project memory also says the UI is an end user demo with no operator or debug controls.

## 5. Constraints and facts from the codebase

- Monorepo: `apps/web` (Next.js 16, React 19, recharts, DuckDB WASM, CodeMirror SQL, viem, `@arkiv-network/sdk` 0.8.1), `apps/indexer` (Bun, Parquet snapshots), `apps/demo-writer`, `packages/core`.
- Charts already exist in `apps/web/components/dash`: `AreaChart`, `ColumnChart`, `HBarChart`, `DonutChart`, `StackedBarChart`, `DataTable`, `WidgetCard`. Reuse them where their props fit; extend rather than add a chart library.
- Browser SQL runs through `apps/web/lib/indexdb.ts`, `use-index.ts`, `use-query.ts`. The playground (`components/playground/Playground.tsx`) has the SQL editor with schema aware autocomplete (`lib/sql-complete.ts`).
- The indexer mirrors only entities matching `INDEX_EXPRESSION`. `arkiv/schema.md` documents the demo value `$creator = addr(<demo writer wallet>)`. Payloads are never stored in Parquet; the browser fetches payloads over RPC on demand. Public SQL views `entities` and `attributes` hide rows with `expires_at <= live_head`.
- Arkiv: expiry is requested in seconds and stored as a block number (2 second blocks). `extendEntity` fails on an expired entity (`EntityExpired`, handled in `apps/demo-writer/src/writer.ts:22`). `executeBatch` with `predictEntityKeys` lets one batch create an entity and reference its key (`apps/demo-writer/src/writer.ts`, `arkiv/schema.md`).
- Network: Tiramisu only, SDK 0.8.x.
- Documentation rule for this repo owner: no dashes as punctuation in docs; keep CHANGELOG.md, DEVELOPER.md, SPECS.md, `arkiv/schema.md` updated.

## 6. Data model on Arkiv

Rule **(user)**: attributes hold queryable information only. Layout and configuration (size, chart type, mapping, query text) live in the payload.

All entities: `contentType: application/json`, created by the backend wallet, which is the Arkiv owner. The app level owner is the `user` attribute. **(call)** Superseded for user widgets by §6.5 (owner decision, 20 October 2026): a user widget is owned on Arkiv by the user's wallet.

### 6.1 Widget entity

Attributes:

| Attribute | Arkiv type | Value |
| :--- | :--- | :--- |
| type | str | `widget` |
| project | str | a new project tag, for example `arkiv-sql-indexer-dash` **(call)** |
| user | addr | creator's Privy embedded wallet address |
| login | str | `google`, `discord`, `x` or `telegram` |
| name | str | widget name |
| chart | str | chart type, duplicated here so SQL can count widgets by type **(call; owner may move it to payload only)** |

Payload (JSON, versioned with `v: 1`):

```json
{
  "v": 1,
  "name": "Top 10 creators",
  "sql": "SELECT creator, count(*) AS n FROM entities GROUP BY 1 ORDER BY n DESC LIMIT 10",
  "chart": "hbar",
  "mapping": { "x": "creator", "y": ["n"], "groupBy": null, "stacking": "off", "sort": "query" },
  "counter": null,
  "format": { "number": "0,0", "xTitle": null, "yTitle": null, "legend": true, "labels": false, "colors": {} },
  "lifetimeDays": 7
}
```

`chart` is one of `table`, `counter`, `bar`, `hbar`, `line`, `area`, `donut`, plus `stacked-bar` and `histogram` (owner decision, 20 October 2026). A `stacked-bar` needs `stacking` of `stack` or `percent`. A `histogram` uses `mapping.x` as the numeric value column, an empty `mapping.y`, no `groupBy`, `stacking` `off`, and `mapping.bins` of 10, 20, 30 or 50 (default 20 when absent); bins are computed in the browser over the returned rows. `mapping.y` is a list; `groupBy` and multiple `y` columns are mutually exclusive. `stacking` is `off`, `stack` or `percent`. `sort` is `query`, `x` or `ydesc`. `counter` holds `{ column, row, prefix, suffix, label, decimals, compact }` when `chart` is `counter`.

Lifetime: the creator picks 1, 7, 30 or 90 days. **(user picks per widget; the four values are a call)**

### 6.2 Dashboard entity

Holds only the dashboard's own information. **(user)**

Attributes: `type=dashboard`, `project`, `user`, `login`, `title`.

Payload: `{ "v": 1, "title": "Top creators", "description": "" }`.

Dashboard lifetime: 90 days, reset on every organize save. **(call)**

### 6.3 Link entity (one per widget placed on a dashboard)

A link places one widget on one dashboard and carries its layout. **(user)** This makes the dashboard to widget reference queryable in SQL, which powers "used on N dashboards", the extend permission check and the widget explorer's popularity sort.

Attributes: `type=link`, `project`, `user` (dashboard owner), `dashboard` (key), `widget` (key).

Payload: `{ "v": 1, "size": "xl", "position": 3, "name": "Top 10 creators" }`.

- `position` orders links within a dashboard (ascending). Reorder rewrites the positions of the moved links in one batch. **(call)**
- `name` is copied from the widget so an expired slot can still show what it was. **(call)**
- Size to width on a 12 column row: xs 3, sm 4, md 6, xl 12; every item is full width on phones. **(call)**
- Link lifetime follows its dashboard: created with the dashboard's remaining time, and extended together with the dashboard on every organize save. **(call)**

### 6.4 Operations

- Create widget: `createEntity`. If "Add to dashboard" is chosen, one `executeBatch` creates the widget (key from `predictEntityKeys`) and its link.
- Edit widget: `updateEntity` with the new payload and attributes. Lifetime is not reset by edit. **(call)**
- Extend widget: `extendEntity` by the widget's `lifetimeDays`, never past 90 days remaining. **(cap is a call)**
- Delete widget: owner only, `deleteEntity`. Links that reference it stay and show the expired or missing slot until the dashboard owner removes them. **(call)**
- Create or rename dashboard: `createEntity` or `updateEntity` of the dashboard.
- Organize save (reorder, resize, import, remove): one `executeBatch` that creates new links, updates changed links, deletes removed links, and extends the dashboard and its remaining links.
- Delete dashboard: owner only; one batch deletes the dashboard and its links.

### 6.5 User owned widgets (owner decision, 20 October 2026)

Approved by the owner on 20 October 2026. It replaces the widget parts of §6.4 and §7 "Write rules".

- Create: the backend wallet creates the widget with creation flags `readonly: true` and `permissionlessExtension: true`, and hands Arkiv ownership to the session address (the Privy embedded wallet that signed the login message) in the same `executeBatch` (`ownershipChanges`). `$creator` stays the backend wallet, so every read keeps proving app provenance with `$creator = <wallet>` plus `project`. Attributes still carry `user` (the author, never changes) and `login`; the payload is unchanged. The server keeps the SQL guard and payload validation on create. With "Add to dashboard" the same batch also creates the link (the link stays owned by the backend wallet).
- Lifecycle after create: the owner signs delete and transfer directly from the Privy wallet in the browser; anyone with gas may sign an extend (permissionless). The server endpoints `PUT /api/dash/widgets/<key>`, `DELETE /api/dash/widgets/<key>` and `POST /api/dash/widgets/<key>/extend` are removed.
- Edit: a readonly entity cannot be patched, so saving changes creates a new version through `POST /api/dash/widgets` with `replaces: <old key>`. The server requires the old widget to be live and its Arkiv `owner` to be the session address, then in one batch creates the new version (flags, transfer to the user) and repoints the user's own links to it (links whose `user` is the session address, which the server only ever sets to the owner of the link's dashboard; patch of the `widget` attribute and the payload `name`). Links on other users' dashboards keep the old key. The old version is not deleted by the server: other dashboards may still use it, and deleting it needs the owner's signature. After saving, the page offers "Delete old version" (a direct signature); otherwise it expires on its own.
- Extend eligibility: any logged in user may extend any live user widget, because the chain allows it and the signer pays their own fee. The old rule "only users who have it on one of their dashboards" existed only because the backend wallet paid; keeping it in the UI would be a restriction anyone can bypass with a script, so it is dropped. Official widgets still show "Kept live" and no Extend.
- Official marker: an entity is official when its `user` attribute AND its Arkiv owner are the backend wallet. Official widgets are never transferred (the seed does not transfer), and keepalive extends only entities that satisfy both. The session guard (no session or write for the wallet address) stays.
- Legacy widgets created before this decision stay owned by the app wallet without flags. They are read only for everyone and expire on their own. They are never transferred: a non readonly widget in a user's hands could have its `user` attribute patched to the app wallet and be transferred back, forging the official marker. Readonly on every user widget is what keeps the `user` attribute trustworthy after a transfer.
- Ownership in the UI: owner view, Delete, Transfer and "My widgets" use the Arkiv `owner` field, not `user`. The byline keeps showing `user` as the author.
- Gas: a user wallet needs GLM (Tiramisu native token) for direct signing. Below 0.1 GLM the UI shows a low balance warning next to Extend, Delete and Transfer and on `/me`, with the address to fund, and still allows the action; at exactly zero the signing buttons are disabled. Creating widgets, dashboards and organizing stay gasless (the backend wallet pays).
- Signing runs in the browser through the Privy embedded wallet's EIP 1193 provider, switched to Tiramisu when needed (Privy `supportedChains` and `defaultChain` include Tiramisu), and the Arkiv SDK wallet client. Wallet errors map to friendly copy (UI §11.4); a user rejection is silent, like a cancelled login.

## 7. Auth and backend

**(user)** The backend verifies ownership with the Privy JWT plus an EIP 191 personal_sign by the user's wallet. User info goes into attributes.

Flow **(call for details)**:

1. Client logs in through Privy. Privy creates an embedded wallet for every social login, since social accounts have no wallet.
2. Client asks the backend for a nonce, signs a fixed message containing the nonce and domain with the embedded wallet (personal_sign).
3. Backend verifies the Privy access token (Privy verification key), recovers the signer, checks the signer is the embedded wallet linked to that Privy user, and checks the nonce is fresh and unused.
4. Backend sets a short lived, httpOnly session cookie bound to the address and login provider.

Backend location: Next.js route handlers in `apps/web`. New secret `DASHBOARD_PRIVATE_KEY` (backend wallet), plus Privy app id and verification config. **(call)**

Write rules enforced server side:

- Update or delete of a widget or dashboard: the entity's `user` attribute must equal the session address. Superseded for widgets by §6.5: the backend no longer updates, deletes or extends widgets; the chain enforces ownership (`NotOwner`) for direct signatures, and a new version (`replaces`) requires the old widget's Arkiv owner to be the session address.
- Extend: caller is the widget's `user`, or a live link exists with `widget` equal to that widget and `user` equal to the caller. The backend checks this with one selective `arkiv_query` on link attributes (it does not depend on the indexer being caught up). **(call)** Superseded by §6.5: extend is permissionless on chain and signed by the caller.
- Payload validation: JSON schema, size cap, chart enum, size enum, lifetime enum.
- Per user rate limit on writes, and one serial write queue for the backend wallet to avoid nonce clashes. **(call; limits left to builder)**

Note **(designer opinion, kept because the owner asked)**: the Privy JWT already proves identity and lists the linked wallet. personal_sign adds proof of key possession at the cost of a signing step; Privy can sign embedded wallet messages without a confirmation prompt.

## 8. Indexer change

Production indexes every entity (blank `INDEX_EXPRESSION`) and stays that way. **(user)** So a separate dashboard wallet needs no indexer change in production. **(call: separate wallet)** The expression exists for self hosters who want a dedicated index; the README must tell them to include the dashboard wallet with `OR` (the documented query grammar, SPECS.md section 4) if they use the widget features. Update `arkiv/schema.md` with the three new entity types.

Trust boundary **(call)**: attributes are not an identity boundary, since any wallet can write `type=widget` (README.md security section). Every app query for widgets and dashboards filters on `creator = <dashboard wallet>`, so entities written by other wallets never appear as user content, even with a blank expression.

Re-index note for self hosters: startup refuses a store built for a different expression (README.md:65), so changing the expression means a fresh data directory and a full backfill.

Payloads stay off Parquet. Pages that need widget configuration fetch payloads over RPC by key, batched where possible.

## 9. Pages

UI design decisions for each page go to an Opus 5.5 design pass before implementation. **(user)** Implementation is done by Codex (decided 20 October 2026, replacing an earlier "Opus implements" rule). **(user)** Codex has no network, cannot install dependencies, cannot bind localhost and cannot commit in a linked worktree, so the coordinator installs packages (Privy, any drag and drop library) and commits.

### 9.1 Nav (existing pages)

Owner decision, 20 October 2026: the nav becomes Home, Explore, Playground and About (UI §10.3); Showcase and Widgets leave the nav. One new button "Build your dashboard" in the top bar. Logged out it opens Privy. Logged in it becomes an avatar menu with "My home" and "Log out". **(user for the button and Privy; menu contents are a call)**

### 9.2 Home `/me` (login required) **(user: layout A)**

- "My dashboards" card grid with "+ New dashboard". Card: title, widget count, last edit.
- "My widgets" grid sorted by soonest expiry, each with time left and Extend. **(call)**
- "My activity" is based on the user's entities, no tx hashes. **(user)** Contents: widgets created, dashboards, active days, entities expiring soon, plus similar stats. **(user)** Proposed set **(call)**: counters for live widgets, live dashboards, total dashboard placements of the user's widgets (links by other users count too), and active days (distinct days with a created or updated entity); an "Expiring soon" list; a recent list of the user's entities by updated time with entity links. Source: local DuckDB over `entities` and `attributes`, filtered by the `user` attribute and `creator = <dashboard wallet>`.
- Limitation: the index hides expired rows, so every count covers live entities only. Extending another user's widget is not attributable to the caller on chain. **(call: accept both for v1)**

### 9.3 Create widget `/widgets/new` and widget page `/widgets/<key>` **(user: Dune style, stacked)**

Top to bottom:

1. Header: name, "Lives for" (1, 7, 30, 90 days), Save to Arkiv.
2. SQL editor with Run (reuse the playground editor and autocomplete).
3. Results table with row count, column names and types, timing.
4. Chart type row: Table, Counter, Bar, H bar, Line, Area, Donut.
5. Live preview on the left; settings on the right. Settings section "Data": X or label column, Y columns (add more), Group by, Stacking (off, stack, 100%), Sort (query, X, Y desc). Collapsed section "Format": number format (`0,0`, `0.0a`, `0.00%`), axis titles, legend, data labels, per series color. Counter settings replace Data when Counter is picked: value column, row, prefix, suffix, label, decimals, compact.
6. Optional "Add to dashboard" with size.

Auto default after first Run **(call)**: one row and one numeric column gives Counter; a time column plus a number gives Line; text plus a number gives Bar, or H bar above 8 rows; otherwise Table.

After save the page is the widget page: creator, time left, Extend, last tx, number of dashboards using it. Owner can edit. Others see it read only with "+ Add to my dashboard".

### 9.4 Dashboard view `/d/<key>` **(user)**

Public. Header: title, creator, widget count, and for the owner "Organize" and "+ Add widget"; for everyone "Copy link". Widgets render in link `position` order, wrapping by link size. Each widget runs its SQL in the viewer's browser. Expired or missing widget: slot shows the stored name and an "expired" badge, nothing runs. **(call)**

### 9.5 Organize dashboard `/d/<key>/edit` (owner only) **(user: drag and drop accepted)**

Left: ordered list, drag handle, name, chart type, size select, imported marker, time left with Extend, remove. Expired rows greyed. Right: live layout preview. Buttons: "+ Import widget" (opens the import modal, 9.7), "+ New widget", Done (one organize batch, 6.4).

### 9.6 Widget explorer `/widgets` (public) **(user: page requested, mockup approved)**

Widgets are the main unit, so they get their own browse page, linked from the top nav as "Widgets". **(call)** Overridden by owner decision, 20 October 2026: the explorer becomes the Widgets tab of `/explore` (tabs Dashboards and Widgets); `/widgets` redirects to `/explore?tab=widgets`; `/widgets/<key>` and `/widgets/new` keep their routes.

- Header: live widget count, "+ New widget".
- Controls: search by name or creator address; chart type filter; sort by Newest, Most used, Expiring soon; "Mine only" toggle when logged in.
- Card grid. Each card: mini preview, name, chart type, creator, "on N dashboards", time left, Open (to `/widgets/<key>`) and "+ Add to dashboard".
- Data: name, chart type, creator, expiry come from SQL over attributes; "on N dashboards" and Most used count live link entities by `widget`. Previews need the widget payload, fetched as one batched `$key` query per page of 12, and render only when a card scrolls into view; each preview query runs in the viewer's DuckDB. **(call)**

### 9.7 Import widget modal **(user: requested; simplified so the preview sits in the card)**

Opened from the organize page.

- Tabs My widgets and All widgets, search, chart type filter.
- The same card as the explorer (mini preview inside the card), in a smaller grid. Click a card to select it; widgets already on this dashboard are shown disabled. No separate preview pane and no size picker. **(user)**
- Footer: "N selected" and "Add N widgets". New links are appended at the end with a default size per chart type: counter xs, donut sm, everything else md. Size and order are changed on the organize page. **(call)**
- Imports from the organize page join the unsaved draft and are written on Done. **(call)**

From a widget page or explorer card, "+ Add to dashboard" opens a small picker of the user's dashboards plus "+ New dashboard", and writes the link immediately. **(call)**

### 9.8 Official dashboards and seeding (owner decision, 20 October 2026)

The showcase queries move into a few Official dashboards: normal dashboard, widget and link entities written by the dashboard wallet. They live in the same ecosystem as user content (anyone can open them at `/d/<key>`, import their widgets, and see them in `/explore`).

Marker: an entity is official when its `user` attribute equals the dashboard wallet address. Official entities carry `login = arkiv`; official dashboards also carry a `slug` attribute. Why this marker is the safest choice:

- The user write API builds every attribute on the server and sets `user` from the session address. A session address is proven by a personal_sign from the Privy embedded wallet linked to the logged in Privy user, so it can never be the dashboard wallet, whose key only the server holds. The server additionally refuses a session or a write whose address equals the wallet.
- It needs no new secret, no config list and no deploy step, and it survives reseeding (a list of official keys in config would go stale every time a dashboard is recreated).
- It is queryable in DuckDB (`usr = <wallet>`) and over RPC (`user = addr(<wallet>)`) with the existing attributes.

Seeding: `apps/web/scripts/seed-official.ts`, run with Bun by the coordinator, writes each Official dashboard with its widgets and links in one `executeBatch` through the server operations module. It is idempotent: a dashboard whose `slug` already exists as a live official dashboard is skipped. Lifetimes: dashboard, links and widgets 90 days (widget `lifetimeDays` 90).

Split of the former showcase views: "Arkiv network overview" (overview counters, creations per hour, entities by type, recently updated), "Expiry watch" (expiry counters, remaining lifetime histogram, expiry horizon, expiry bucket by type as a stacked bar, expiring next), "Creators" (creator counters, top creators, creators by distinct types, creator vs current owner), "Attributes and activity" (attribute usage, numeric statistics, top status values, updates per 10 minutes, create vs update, running count).

### 9.9 Keeping Official items alive (owner decision, 20 October 2026)

The app wallet extends official dashboards, widgets and links (all entities with `user` = wallet) before they expire. Mechanism: an in process timer started from `apps/web/instrumentation.ts` in the Node.js runtime. It runs 60 seconds after server start and then every 6 hours, through the same serial write queue as user writes. Each run makes one creator scoped `arkiv_query` for official entities and, when any has less than 30 days left, one `executeBatch` of extensions to head plus 90 days (chunks of 50). It is idempotent (a second run in a row extends nothing) and does nothing when dashboards are disabled. The seed script offers the same run on demand (`--keepalive`). Chosen over a cron route because it needs no new secret, no public endpoint and no Dokploy job; the deployment runs one web container, so one timer runs.

### 9.10 Theme and shell (owner decision, 20 October 2026)

The v5 console theme (UI §10) applies to every page: dark default, light theme with a persisted toggle that follows `prefers-color-scheme` when unset and never flashes on load, navbar option A, the status bar on every page, report style dashboard view, widget actions on hover or focus only, faint widget borders, share icon menu (Copy link, Post on X). Time range pickers are removed. Fork is out of scope.

## 10. Left to the builder

- Session cookie format, nonce storage, rate limit numbers.
- Privy SDK wiring and which Privy packages; verify their API against installed source, not memory.
- Exact props changes to existing chart components.
- How the activity feed and import picker query the local DuckDB (SQL over `entities` and `attributes`).
- Error and loading states, optimistic updates after a write while the indexer catches up.
- Tests, following the existing `apps/web/test` style.

## 11. Open questions

None. A builder check ran on 20 October 2026; its questions (reference queryability, activity data source, production expression, implementer, Privy setup) were answered by the owner and folded into sections 6 to 9. `NEXT_PUBLIC_PRIVY_APP_ID` is set in the owner's local env; Privy dashboard configuration for the four providers is the owner's step.
