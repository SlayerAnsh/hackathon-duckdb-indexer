# Arkiv schema and queries

This file lists the widget, dashboard and link entity types the web app's app wallet (the dashboard wallet) creates, their attributes and expiry, and every Arkiv RPC request the indexer and the browser send. Network: Rabdi, chain ID 7794095, RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network` (until November 2026: Tiramisu, chain ID 7738577; the app wallet and evidence below are from there). SDK: `@arkiv-network/sdk` 0.8.1 with viem 2.57.7 (declared range `^2.57.3`). App wallet (creator of every app entity): `0x1f61c3cac1612c020f64739b128c5f198939c8cd`; on chain evidence with explorer links is in the [README](../README.md#on-chain-evidence).

The open source indexer (`apps/indexer`) is schema agnostic. It mirrors every live entity that matches `INDEX_EXPRESSION` (blank means every entity on the chain), whatever its attributes. The application entity types, lifetimes and operations are documented in [Widget dashboards](#widget-dashboards). Payloads stay on chain and are fetched on demand, never stored in Parquet.

## SQL columns

Every entity also has the system fields `key`, `owner`, `creator`, `createdAt`, `updatedAt`, `expiresAt`, `contentType` and `creationFlags`. Public SQL exposes two views:

* `entities`: `key`, `owner`, `creator`, `created_at`, `updated_at`, `expires_at`, `content_type`, `creation_flags`, `attrs_pending`.
* `attributes`: `key`, `name`, `type`, `value`, `num`.

These columns, the manifest fields and the `delta.json` shape form the data contract, versioned by `schemaVersion` in `manifest.json` (currently `1`, `SCHEMA_VERSION` in `packages/core/src/types.ts`). The version is bumped only when a field or column is removed, renamed or retyped, or its meaning changes; adding a column or an optional field keeps it, and consumers ignore what they do not know. A consumer reads the manifest first and refuses any version other than the one it was written for; a manifest without the field predates versioning and reads as `1` (`schemaCheck` in `apps/web/lib/indexdb.ts`, `examples/`).

Block numbers are numeric. Addresses and keys are lowercase hex. `value` is canonical text (decimal for `u64`, `u256`, `i32` and `dec`; lowercase `0x` hex for `addr`, `key` and `bytes32`). `num` is an approximate DOUBLE for numeric types and `bool`. `attrs_pending` is true for rows written from log data whose attributes are not fetched yet; these rows have no attribute rows. `attributes` follows only the winning live entity version. Both views hide rows with `expires_at <= live_head`.

## Exact Arkiv queries

All requests are direct JSON RPC POSTs built by `packages/core/src/rpc.ts`. `atBlock` and `limit` are sent as hex quantities. `$key` predicates are rendered with SDK `key`, `eq`, `or` and `render`, in chunks of at most 50 keys (`packages/core/src/query.ts`).

The row selection `ROW_SELECT` is:

```json
{"key":true,"owner":true,"creator":true,"createdAt":true,"updatedAt":true,"expiresAt":true,"creationFlags":true,"contentType":true,"attributes":true}
```

### Key chunk shape

With a configured expression, a chunk of two keys renders as:

```text
($creator = addr(0x1f61c3cac1612c020f64739b128c5f198939c8cd)) AND ($key = key(0x0000000000000000000000000000000000000000000000000000000000000001) OR $key = key(0x0000000000000000000000000000000000000000000000000000000000000002))
```

A single key keeps the outer parentheses but has no `OR`. With a blank expression the indexer sends the bare `OR` of key terms.

### Indexer (default, keyless)

| Purpose | Method and arguments | Cadence |
| :--- | :--- | :--- |
| Store identity | `eth_chainId`; `eth_getBlockByNumber("0x0", false)` for the genesis hash | Startup |
| Confirmed head | `eth_blockNumber`, minus `CONFIRMATIONS` (default 3) | Every 2 s |
| Reorg check | `eth_getBlockByNumber(<block>, false)` hash of the checkpoint and of the batch end | Every batch |
| Backfill replay | `eth_getLogs({address: 0x4400000000000000000000000000000000000044, fromBlock, toBlock})` from block zero, adaptive windows starting at 20,000 blocks | Once, resumable per window |
| Live sync | Same `eth_getLogs` in windows of at most 1,000 blocks, decoded with SDK `ENTITY_EVENTS_ABI` | Every `SYNC_BATCH_BLOCKS` (default 5) blocks |
| Attribute fill | `arkiv_query(<key chunk>, {atBlock: <indexed head>, limit: 200, select: ROW_SELECT, cursor})` with up to `FILL_CHUNK` (default 50) pending keys, newest `updated_at` first | Every `FILL_INTERVAL_MS` (default 4000 ms) |

No `arkiv_query` runs per event. A fill response is accepted only if its `blockNumber` equals the requested `atBlock`, and a fetched row is written only if the key is still pending and unchanged since that block.

### Indexer (opt in, keyed)

`BACKFILL_MODE=query` pages the expression itself at one confirmed block: `arkiv_query(INDEX_EXPRESSION, {atBlock: head minus CONFIRMATIONS, limit: 200, select: ROW_SELECT, cursor})`. With `SYNC_USE_API_KEY=true` or `BACKFILL_MODE=query`, live sync queries the touched relevant keys of each batch as key chunks with `{atBlock: <batch end>, limit: 200, select: ROW_SELECT, cursor}` on `ARKIV_RPC_URL`, sending `Authorization: Bearer <ARKIV_API_KEY>`. Returned keys replace their attributes; relevant indexed keys that are missing become tombstones. A batch with no relevant keys sends no `arkiv_query`.

### Browser (through the `/api/rpc` read proxy, no credentials in the browser)

Browser reads go to the web app's same origin `POST /api/rpc`, which forwards them to `NEXT_PUBLIC_ARKIV_RPC_URL` and adds `Authorization: Bearer <ARKIV_API_KEY>` only when the server has a key. Wallet signatures use the public RPC directly.

| Purpose | Method and arguments | Cadence |
| :--- | :--- | :--- |
| Live head | `eth_blockNumber`, stored as `live_head` | Every 2 s |
| Chain check | `eth_chainId` and genesis hash, compared with the manifest | Each manifest refresh (about every 10 s) |
| Live tail | `eth_getLogs` on the Arkiv address from `delta.toBlock + 1`, windows of at most 1,000 blocks | Every 4 s |
| Live attributes | `arkiv_query(<key chunk with the manifest expression>, {atBlock: <head>, limit: 50, select: ROW_SELECT})` for up to 50 created or patched keys | At most once every 20 s; HTTP 429 pauses it until Retry-After |
| Payload button | `arkiv_query("$key = key(<key>)", {select: {"payload":true,"contentType":true}})` at current head | On click |
| Verify button (`verifyRows` in `apps/web/lib/verify.ts`) | `arkiv_query(<bare key chunk>, {select: {"key":true,"updatedAt":true,"expiresAt":true,"owner":true}, cursor})` for the result's keys, chunks of 50 | On click |

Payload and Verify use bare key predicates without the configured expression, without `atBlock` and without an explicit limit. Verify compares returned metadata with the indexed row and the live head; it is an RPC comparison, not a cryptographic proof, so it trusts the RPC node that answers (the server's `NEXT_PUBLIC_ARKIV_RPC_URL`, reached through `/api/rpc`; a self hosted app can point it at any endpoint or its own node), and a missing entity cannot distinguish deletion from expiry. The browser relevance prefilter matches the indexer: a log is used when its key is already known, when its `EntityCreated` owner matches a `$creator` or `$owner` term, or when the expression has no such terms.

## Widget dashboards

The web backend writes `widget`, `dashboard` and `link` entities with `contentType: application/json` and UTF-8 JSON payloads. The app wallet is the Arkiv creator of every entity. A user widget's Arkiv owner is the user's wallet; dashboards, links and Featured widgets remain app owned. The `user` attribute records widget authorship and application ownership for dashboards and links, represented by a Privy embedded wallet. Widget owner controls and My widgets use the Arkiv owner, never the author. Login values are `google`, `discord`, `x` or `telegram`; no email, social handle or Privy user ID is written. Payloads remain off Parquet. Everything is public.

| Entity type | Attribute | Arkiv type | Value or purpose |
| :--- | :--- | :--- | :--- |
| widget | type | str | `widget` |
| widget | project | str | `arkiv-sql-indexer-dash` |
| widget | user | addr | Widget creator's embedded wallet |
| widget | login | str | Login provider |
| widget | name | str | Widget name |
| widget | chart | str | Chart type |
| dashboard | type | str | `dashboard` |
| dashboard | project | str | `arkiv-sql-indexer-dash` |
| dashboard | user | addr | Dashboard owner's embedded wallet |
| dashboard | login | str | Login provider |
| dashboard | title | str | Dashboard title |
| dashboard | slug | str | Featured dashboards only, see [Featured entities](#featured-entities) |
| dashboard | cover | key | Optional. Entity key of one live widget linked to this dashboard, starred in Organize; its live chart is the dashboard card cover. Readers ignore an unlinked, missing, expired or untrusted cover widget |
| link | type | str | `link` |
| link | project | str | `arkiv-sql-indexer-dash` |
| link | user | addr | Dashboard owner's embedded wallet |
| link | dashboard | key | Dashboard entity key |
| link | widget | key | Widget entity key |

### Expiration per entity type

| Entity | Lifetime at creation | How it is renewed | Ends |
| :--- | :--- | :--- | :--- |
| User widget | 1, 7, 30 or 90 days, chosen by the author (`lifetimeDays`) | Anyone logged in signs `extendEntity`, adding `lifetimeDays` again, capped at 90 days remaining | Expiry, or the owner deletes it |
| Dashboard | 90 days | Every Organize save extends it to head plus 90 days | Expiry, or the owner deletes it with its links |
| Link | The dashboard's current expiry block | Extended with its dashboard on every Organize save | Expiry, removal in Organize, or dashboard delete |
| Featured dashboard, widget and link | 90 days | App wallet keepalive: checked every 6 hours, and anything with fewer than 30 days left goes to head plus 90 days. No renewal has fallen due yet; the first is due about 60 days after creation | Expiry, if the app stops running |

### Why these choices

* **`readonly` on user widgets.** A user widget is transferred to its author, and after that the app no longer controls it. Readonly freezes attributes and payload for life (SDK `entity/flags.ts`: "The entity's attributes and payload can never be changed"). Without it the new owner could patch `user` to someone else, or to the app wallet, and transfer it back to forge the Featured marker. Edits therefore save a new version instead of a patch.
* **`permissionlessExtension` on user widgets.** Anyone, not only the owner, can keep a useful widget alive (SDK: "Lets a third party keep something alive without being able to change it"). A viewer who relies on a widget on someone else's dashboard can extend it and pays their own fee. A rule like "only people who placed it may extend" was dropped because the chain allows anyone, so a UI rule would be bypassed by a script.
* **Widget lifetimes of 1, 7, 30 or 90 days.** The author decides how long a public query stays public. Extending adds the same lifetime again, so a widget stays alive only while someone keeps renewing it. The 90 day cap is an app rule, not a protocol limit (the SDK accepts any `uint64` expiry), so no widget is ever more than 90 days from expiring without renewed activity.
* **Dashboards 90 days, renewed on save; links follow their dashboard.** Editing a dashboard is the activity that keeps it alive. A link carries the dashboard's expiry block, so a placement never outlives its dashboard or dies before it; an expired widget leaves a named empty slot instead of a broken layout.
* **Featured keepalive.** Featured dashboards are the landing content, so the app wallet renews them as a lease from inside the web server (`apps/web/lib/dash/server/keepalive.ts`), with no cron job, public endpoint or extra secret.
* **One atomic batch.** `executeBatch` applies every operation or none (SDK `clients/decorators/arkivWallet.ts`: "the whole batch applies or none of it does"). Create plus `ownershipChanges` means a saved widget is never left owned by the app wallet; widget plus link means a link never points at a widget that failed to create; Organize saves a whole layout (creates, patches, deletes, extensions) or nothing. Keys come from `predictEntityKeys` inside the same serial queue slot, because a prediction holds only while nothing else from that owner is in flight.
* **Polling instead of WebSocket events.** Both the indexer and the browser poll `eth_getLogs` directly rather than using the SDK event watcher, which gives explicit block windows and checkpoints (SPECS §5). The indexer commits a checkpoint per batch, and the browser live tail starts at `delta.toBlock + 1`, exactly where the indexer's published window ends. We tested `watchEntityEvents` over the Tiramisu WebSocket on 20 October 2026: it pushed every event while connected, but after a forced reconnect it resumed at the new head and skipped the blocks in between ([friction report](friction.md#websocket-entity-events-tested-path-gap-on-reconnect)). A mirror that must not miss a key needs the checkpointed window anyway.
* **`cover` as a typed `key` attribute.** It is queryable and joinable in SQL: list queries accept the cover only when a live link of the dashboard owner points at that widget (`dashCte` and `dashboardListSql` in `apps/web/lib/dash/sql.ts`). Organize sets it with a patch `set` and removes it with `unset: ['cover']`; a patch names only what changes (SDK `actions/wallet/patchEntity.ts`: "Attributes it does not mention keep whatever value they have"), so `user`, `login`, `title` and `slug` stay as they were.

### Payloads and enums

Widget payload:

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

Dashboard payload:

```json
{ "v": 1, "title": "Top creators", "description": "" }
```

Link payload:

```json
{ "v": 1, "size": "xl", "position": 3, "name": "Top 10 creators" }
```

Charts: `table`, `counter`, `bar`, `stacked-bar`, `hbar`, `line`, `area`, `donut`, `histogram`. Mapping has an optional X column, Y columns and optional `groupBy`; grouping and multiple Y columns are mutually exclusive. Stacking: `off`, `stack`, `percent`. Sort: `query`, `x`, `ydesc`. Number formats: `0,0`, `0.0a`, `0.00%`. Colors map series names to `c1` through `c8`.

Histogram widgets use `mapping.bins` with a value of 10, 20, 30 or 50, defaulting to 20. This field is stored only for histogram charts. A histogram maps one numeric value column through `mapping.x`, with no Y columns, no group column and stacking off. Stacked bar widgets use stack or percent stacking.

For a counter chart, `counter` holds a value column, zero based row, prefix, suffix, label, decimals and compact flag, for example:

```json
{ "column": "n", "row": 0, "prefix": "", "suffix": "", "label": "Creators", "decimals": 0, "compact": true }
```

Size spans on a 12 column row are `xs: 3`, `sm: 4`, `md: 6`, `xl: 12`; phones show full width. Defaults are counter `xs`, donut `sm`, other charts `md`. Link positions sort ascending; the copied name remains available when the widget expires or is deleted. A dashboard allows at most 48 links and cannot contain the same widget twice.

### Expiry and operations

One day is 43,200 blocks at two seconds per block. App wallet writes (widget create and new version, dashboards, links, organize, Featured seed and keepalive) run through `apps/web/lib/dash/server/operations.ts` inside one serial wallet queue and check ownership against live RPC state. User widgets have `readonly: true` and `permissionlessExtension: true`, fixed at creation. Creating and transferring happen in one `executeBatch` with `creates` then `ownershipChanges`; only the predicted widget key is transferred to the session address. Links have no creation flags and are never transferred. Widget extend, delete and transfer have no server endpoint: the user's Privy wallet signs them in the browser (`apps/web/lib/dash/widget-actions.ts`) and needs GLM. Saving stays free.

| Entity or action | Implemented operation and expiry |
| :--- | :--- |
| Create widget | One `executeBatch` with a flagged widget create and an ownership change to the session wallet. `predictEntityKeys({ owner, count: 1 })` runs in the same queue slot; the create reuses the predicted salt. Expiry is `ExpirationTime.fromSeconds(lifetimeDays * 86400)`; `lifetimeDays` is 1, 7, 30 or 90. |
| Create widget plus placement | One `executeBatch` creates the flagged widget and link and transfers only the widget to the session wallet. Inside the same queue slot, `predictEntityKeys({ owner, count: 2 })` supplies keys and salts; each create reuses its salt, and the link references the predicted widget key. The link uses the existing dashboard's expiry with `ExpirationTime.atBlock`. |
| Edit widget | Owner only, create a new version through `POST /api/dash/widgets` with `replaces`. One batch creates and transfers the new widget and uses link patches (`patchEntity` semantics) to repoint only the author's live dashboard links, including their copied names. The old version stays until expiry or owner deletion. |
| Extend widget | `extendEntity` with `ExpirationTime.atBlock(BigInt(target))`, where `target = min(expiresAt + lifetimeDays * 43200, head + 90 * 43200)`. Permissionless on user widgets: any logged in viewer signs in the browser and pays the fee. Expired widgets cannot extend; a target no later than the existing expiry is rejected as at cap. |
| Delete widget | Arkiv owner only, browser signed `deleteEntity`. Links stay and display the stored name in a missing or expired slot; no SQL runs for that slot. |
| Transfer widget | Arkiv owner only, browser signed `changeOwnership` to a different nonzero address. The `user` author and `$creator` stay unchanged. |
| Create dashboard | `createEntity`, 90 days through `ExpirationTime.fromSeconds`; title and description in payload |
| Rename or edit dashboard | Owner only, `patchEntity` sets title and replaces payload; this operation alone does not reset expiry |
| Add existing widget | Dashboard owner only, `createEntity` for a link at the next position, with `ExpirationTime.atBlock` set to dashboard expiry |
| Organize dashboard | Owner only, one `executeBatch` creates imported links, patches changed link sizes and positions, optionally patches the dashboard title and `cover` (a `set` of `cover` to the key of a live widget in the final layout, or `unset: ['cover']` when the starred widget leaves the layout or is cleared; the payload is replaced only when the title changes), deletes removed links, and extends the dashboard and retained links to `head + 90 * 43200`. New links use the same target. Extensions are sent only when the target is later. An empty plan sends no transaction. |
| Delete dashboard | Owner only, one `executeBatch` deletes the dashboard and its live links; referenced widgets remain |
| Seed Featured dashboard | App wallet only (`seedOfficial` in `apps/web/lib/dash/server/official.ts`). One `executeBatch` creates the dashboard, its widgets and its links with 90 day lifetimes, with keys and salts from `predictEntityKeys({ owner, count: 1 + 2n })` for n widgets. When the definition names a cover, the dashboard is created with `cover` set to the predicted widget key |
| Featured keepalive | App wallet only (`keepOfficialAlive`). Every 6 hours, `executeBatch` extensions in chunks of 50 move live Featured entities with fewer than 30 days left to head plus 90 days; the same pass then reconciles covers |
| Set Featured covers | App wallet only (`setOfficialCovers`, CLI `--set-covers`). For each Featured dashboard whose definition names a cover, a patch `set: { cover }` points it at the first live linked widget with that name when it differs; with `--dry-run` it only counts |

Native batch order is creates, patches, deletes, extensions, ownership changes. Links follow their dashboard's expiry rather than their widget's expiry, so expired widget slots can remain until removed.

### Dashboard RPC reads and trust boundary

These expressions are built with the SDK helpers in `apps/web/lib/dash/entities.ts`. In the templates below, W is the lowercase backend wallet address, D a dashboard key, K a widget key, E an extra widget key and U the session wallet address. Substitute full hexadecimal addresses and keys before sending. `S` denotes the complete `scopeExpr(W)` expression, not a literal RPC identifier. The templates below match the SDK grouping. The SDK renders address literals in checksum case even though the application normalizes addresses to lowercase.

```text
scopeExpr(W):
$creator = addr(W) AND project = str('arkiv-sql-indexer-dash')

dashboardBundleExpr(W, D, [E1, E2]):
S AND ($key = key(D) OR $key = key(E1) OR $key = key(E2) OR type = str('link') AND dashboard = key(D))

widgetVersionExpr(W, K, U):
S AND ($key = key(K) OR type = str('link') AND widget = key(K) AND user = addr(U))

keysExprs(W, [K1, K2]):
(S) AND ($key = key(K1) OR $key = key(K2))

officialExpr(W):
$creator = addr(W) AND project = str('arkiv-sql-indexer-dash') AND user = addr(W) AND $owner = addr(W)
```

Without extras, the dashboard bundle includes only the dashboard key alternative and its links. Key chunks contain at most 50 keys; a single key has no OR group and an empty key list sends no query. The actual two key chunk for the app wallet is:

```text
($creator = addr(0x1f61c3cac1612C020f64739B128C5f198939C8Cd) AND project = str('arkiv-sql-indexer-dash')) AND ($key = key(0x0000000000000000000000000000000000000000000000000000000000000001) OR $key = key(0x0000000000000000000000000000000000000000000000000000000000000002))
```

Every expression is sent through `queryAll` as `arkiv_query(expression, { limit: 200, select: DASH_SELECT, cursor })`. No `atBlock` is supplied; the returned head is the first page's `blockNumber`, and every cursor page is read. The shared selection is:

```json
{
  "key": true,
  "owner": true,
  "creator": true,
  "createdAt": true,
  "updatedAt": true,
  "expiresAt": true,
  "attributes": true,
  "payload": true
}
```

| Caller and purpose | Expression |
| :--- | :--- |
| Server new widget version and link lookup | `widgetVersionExpr(W, K, U)` |
| Server create widget with placement, dashboard edit or delete | `dashboardBundleExpr(W, D)` |
| Server organize or add existing widget | `dashboardBundleExpr(W, D, extraKeys)` with newly imported widget keys |
| Browser dashboard and placement layout | `dashboardBundleExpr(W, D)` |
| Browser widget page, dashboard widget payloads, explorer previews, cover payloads, home lifetime data | `keysExprs(W, keys)` in chunks of 50; explorer preview batches contain 12 keys per page |
| Server organize, when the cover widget is not in the bundle | `keysExprs(W, [cover])[0]` |
| Server Featured seed (slug exists check), keepalive and cover reconcile | `officialExpr(W)` (`apps/web/lib/dash/official.ts`) |

Dashboard reads always filter `$creator` on the configured dashboard wallet as well as project. Another wallet can copy every attribute, so attributes alone are never trusted identity. Decoders recheck creator, project, type, required attributes and payload validity before accepting an entity. Lists, counts and activity use creator and project scoped local DuckDB SQL; RPC reads supply payloads only where needed. Those SQL builders live in `apps/web/lib/dash/sql.ts`: `dashCte` (every app entity with `WHERE e.creator = <W>` and `project = 'arkiv-sql-indexer-dash'`, attributes pivoted into columns), `officialSql` (Featured: `usr` and `owner` equal W), `mineSql` (widgets by `owner`, dashboards and links by `usr`), `dashboardListSql` and `dashboardCountSql` (Explore dashboards, with the cover resolved only through a live link of the same `usr`), `widgetListSql` and `widgetCountSql` (Explore widgets), `myDashboardsSql`, `myWidgetsSql`, `activityCountsSql`, `expiringSoonSql` and `recentSql` (Home), `userDashboardsSql`, `widgetUsageSql` and `widgetDashboardsSql` (Used on N dashboards) and `syncedSql` (whether a pending write has reached the index). Stored widget SQL must pass `checkWidgetSql` before execution in the viewer's DuckDB, capped at 5,000 result rows.

Legacy widgets without creation flags remain owned by the app wallet and have no user Extend, Delete or Transfer actions. Do not transfer them to users: mutable attributes could undermine the Featured marker.

## Featured entities

User facing copy calls these Featured; code and helpers use the name official (`apps/web/lib/dash/official.ts`). An entity is Featured when its `user` attribute and `$owner` both equal the app wallet address. Readers still require the app wallet as creator and the dashboard project tag. Featured widgets and dashboards use `login = arkiv`. Featured dashboards also carry a string `slug` attribute with at most 64 bytes, matching `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

Featured dashboards, widgets and links have 90 day lifetimes and are kept alive by the app wallet: an in process timer runs 60 seconds after server start and then every 6 hours, reads `officialExpr(W)`, and extends every live Featured entity with fewer than 30 days left to head plus 90 days in batches of 50 (`apps/web/lib/dash/server/keepalive.ts`, `keepOfficialAlive`). The same pass reconciles the configured covers. A user cannot forge a Featured entity through the API: the server derives `user` from the verified session, refuses app wallet sessions and rejects app wallet addresses in every user write operation. Readers accept `login = arkiv` only when `user` equals the app wallet.

On 20 October 2026 at block 805,828 the 67 live Featured entities had been created at blocks 804,188 to 804,203 and expired at blocks 4,692,188 to 4,692,203, exactly 90 days later, so no keepalive extension had been sent yet. The first falls due when fewer than 30 days remain, around 19 December 2026.

## Leftover `ticket` entities

The app wallet is also the creator of 5 `ticket` entities with `project = arkiv-sql-indexer-demo`. A demo writer (`apps/demo-writer`, added in `852c707`) created them on 18 October 2026 as sample data for the indexer, before widgets and dashboards existed. Commit `9599b10` removed the writer on 20 October 2026, and nothing in the app reads or writes these entities any more; every application read is scoped to `project = arkiv-sql-indexer-dash`. They were left to expire rather than deleted, which costs nothing and shows Entity Expiration at work.

| Attribute | Arkiv type | Values seen |
| :--- | :--- | :--- |
| type | str | `ticket` |
| project | str | `arkiv-sql-indexer-demo` |
| title | str | `Coral console`, `Blue widget`, `Amber console`, `Blue beacon`, `Coral beacon` |
| status | str | `open` or `closed` |
| priority | u64 | 1 to 3 |

Payload `text/plain`, creation flags `permissionlessExtension` (raw 2), owner and creator the app wallet. Read back through `POST /api/rpc` on 20 October 2026 at block 805,811 with `$creator = addr(0x1f61c3cac1612c020f64739b128c5f198939c8cd) AND project = str('arkiv-sql-indexer-demo')`: created at blocks 744,721 to 744,807 with lifetimes of about 7 days (about 302,400 blocks), they expire at blocks 1,047,142 to 1,047,207, about 25 October 2026 at 16:00 UTC. After that only their creation transactions remain on the explorer.
