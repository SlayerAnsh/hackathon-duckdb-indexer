# Arkiv schema and queries

This file lists the widget, dashboard and link entity types the dashboard wallet creates, their attributes and expiry, and every Arkiv RPC request the indexer and the browser send. Network: Tiramisu, chain ID 7738577, RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`. SDK: `@arkiv-network/sdk` 0.8.1 with viem 2.57.3.

The indexer itself is schema agnostic. It mirrors every live entity that matches `INDEX_EXPRESSION` (blank means every entity on the chain), whatever its attributes. The application entity types, lifetimes and operations are documented in [Widget dashboards](#widget-dashboards). Payloads stay on chain and are fetched on demand, never stored in Parquet.

## SQL columns

Every entity also has the system fields `key`, `owner`, `creator`, `createdAt`, `updatedAt`, `expiresAt`, `contentType` and `creationFlags`. Public SQL exposes two views:

* `entities`: `key`, `owner`, `creator`, `created_at`, `updated_at`, `expires_at`, `content_type`, `creation_flags`, `attrs_pending`.
* `attributes`: `key`, `name`, `type`, `value`, `num`.

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
($creator = addr(0xb0b87eddb0bc777eb663c7a11703ba5ed4849a28)) AND ($key = key(0x0000000000000000000000000000000000000000000000000000000000000001) OR $key = key(0x0000000000000000000000000000000000000000000000000000000000000002))
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

`BACKFILL_MODE=query` pages the expression itself at one confirmed block: `arkiv_query(INDEX_EXPRESSION, {atBlock: head minus CONFIRMATIONS, limit: 200, select: ROW_SELECT, cursor})`. With `SYNC_USE_API_KEY=true` or `BACKFILL_MODE=query`, live sync queries the touched relevant keys of each batch as key chunks with `{atBlock: <batch end>, limit: 200, select: ROW_SELECT, cursor}` on `ARKIV_RPC_URL`, sending `Authorization: Bearer <TIRAMISU_API_KEY>`. Returned keys replace their attributes; relevant indexed keys that are missing become tombstones. A batch with no relevant keys sends no `arkiv_query`.

### Browser (public RPC, no credentials)

| Purpose | Method and arguments | Cadence |
| :--- | :--- | :--- |
| Live head | `eth_blockNumber`, stored as `live_head` | Every 2 s |
| Chain check | `eth_chainId` and genesis hash, compared with the manifest | Each manifest refresh (about every 10 s) |
| Live tail | `eth_getLogs` on the Arkiv address from `delta.toBlock + 1`, windows of at most 1,000 blocks | Every 4 s |
| Live attributes | `arkiv_query(<key chunk with the manifest expression>, {atBlock: <head>, limit: 50, select: ROW_SELECT})` for up to 50 created or patched keys | At most once every 20 s; HTTP 429 pauses it until Retry-After |
| Payload button | `arkiv_query("$key = key(<key>)", {select: {"payload":true,"contentType":true}})` at current head | On click |
| Verify button (`verifyRows` in `apps/web/lib/verify.ts`) | `arkiv_query(<bare key chunk>, {select: {"key":true,"updatedAt":true,"expiresAt":true,"owner":true}, cursor})` for the result's keys, chunks of 50 | On click |

Payload and Verify use bare key predicates without the configured expression, without `atBlock` and without an explicit limit. Verify compares returned metadata with the indexed row and the live head; it is an RPC comparison, not a cryptographic proof, and a missing entity cannot distinguish deletion from expiry. The browser relevance prefilter matches the indexer: a log is used when its key is already known, when its `EntityCreated` owner matches a `$creator` or `$owner` term, or when the expression has no such terms.

## Widget dashboards

The web backend writes `widget`, `dashboard` and `link` entities with `contentType: application/json` and UTF-8 JSON payloads. Its wallet is both Arkiv creator and owner. The `user` attribute is application ownership, represented by a Privy embedded wallet. Login values are `google`, `discord`, `x` or `telegram`; no email, social handle or Privy user ID is written. Payloads remain off Parquet. Everything is public.

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
| link | type | str | `link` |
| link | project | str | `arkiv-sql-indexer-dash` |
| link | user | addr | Dashboard owner's embedded wallet |
| link | dashboard | key | Dashboard entity key |
| link | widget | key | Widget entity key |

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

One day is 43,200 blocks at two seconds per block. Writes run through `apps/web/lib/dash/server/operations.ts` inside one serial wallet queue. The backend checks the session's application ownership against live RPC state before mutation.

| Entity or action | Implemented operation and expiry |
| :--- | :--- |
| Create widget | `createEntity` with `ExpirationTime.fromSeconds(lifetimeDays * 86400)`; `lifetimeDays` is 1, 7, 30 or 90 |
| Create widget plus placement | One `executeBatch` creates the widget and link. Inside the same queue slot, `predictEntityKeys({ owner, count: 2 })` supplies keys and salts; each create reuses its salt, and the link references the predicted widget key. The link uses the existing dashboard's expiry with `ExpirationTime.atBlock`. |
| Edit widget | `patchEntity` sets name and chart attributes and replaces the payload. The original `lifetimeDays` is preserved; edit does not reset expiry. |
| Extend widget | `extendEntity` with `ExpirationTime.atBlock(BigInt(target))`, where `target = min(expiresAt + lifetimeDays * 43200, head + 90 * 43200)`. The caller must be the widget creator or have a live link to it with their `user` address. Expired widgets cannot extend; a target no later than the existing expiry is rejected as at cap. |
| Delete widget | Creator only, `deleteEntity`. Links stay and display the stored name in a missing or expired slot; no SQL runs for that slot. |
| Create dashboard | `createEntity`, 90 days through `ExpirationTime.fromSeconds`; title and description in payload |
| Rename or edit dashboard | Owner only, `patchEntity` sets title and replaces payload; this operation alone does not reset expiry |
| Add existing widget | Dashboard owner only, `createEntity` for a link at the next position, with `ExpirationTime.atBlock` set to dashboard expiry |
| Organize dashboard | Owner only, one `executeBatch` creates imported links, patches changed link sizes and positions, optionally patches the dashboard title, deletes removed links, and extends the dashboard and retained links to `head + 90 * 43200`. New links use the same target. Extensions are sent only when the target is later. An empty plan sends no transaction. |
| Delete dashboard | Owner only, one `executeBatch` deletes the dashboard and its live links; referenced widgets remain |

Native batch order is creates, patches, deletes, extensions. Links follow their dashboard's expiry rather than their widget's expiry, so expired widget slots can remain until removed.

### Dashboard RPC reads and trust boundary

These expressions are built with the SDK helpers in `apps/web/lib/dash/entities.ts`. In the templates below, W is the lowercase backend wallet address, D a dashboard key, K a widget key, E an extra widget key and U the session wallet address. Substitute full hexadecimal addresses and keys before sending. `S` denotes the complete `scopeExpr(W)` expression, not a literal RPC identifier. The templates below match the SDK grouping. The SDK renders address literals in checksum case even though the application normalizes addresses to lowercase.

```text
scopeExpr(W):
$creator = addr(W) AND project = str('arkiv-sql-indexer-dash')

dashboardBundleExpr(W, D, [E1, E2]):
S AND ($key = key(D) OR $key = key(E1) OR $key = key(E2) OR type = str('link') AND dashboard = key(D))

widgetExtendExpr(W, K, U):
S AND ($key = key(K) OR type = str('link') AND widget = key(K) AND user = addr(U))

keysExprs(W, [K1, K2]):
(S) AND ($key = key(K1) OR $key = key(K2))
```

Without extras, the dashboard bundle includes only the dashboard key alternative and its links. Key chunks contain at most 50 keys; a single key has no OR group and an empty key list sends no query. The actual two key chunk for the example dashboard wallet is:

```text
($creator = addr(0xb0B87EdDB0bc777Eb663c7a11703ba5ED4849A28) AND project = str('arkiv-sql-indexer-dash')) AND ($key = key(0x0000000000000000000000000000000000000000000000000000000000000001) OR $key = key(0x0000000000000000000000000000000000000000000000000000000000000002))
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
| Server widget edit or delete | `keysExprs(W, [K])` |
| Server widget extension and permission check | `widgetExtendExpr(W, K, U)` |
| Server create widget with placement, dashboard edit or delete | `dashboardBundleExpr(W, D)` |
| Server organize or add existing widget | `dashboardBundleExpr(W, D, extraKeys)` with newly imported widget keys |
| Browser dashboard and placement layout | `dashboardBundleExpr(W, D)` |
| Browser widget page, dashboard widget payloads, explorer previews, home lifetime data | `keysExprs(W, keys)` in chunks of 50; explorer preview batches contain 12 keys per page |

Dashboard reads always filter `$creator` on the configured dashboard wallet as well as project. Another wallet can copy every attribute, so attributes alone are never trusted identity. Decoders recheck creator, project, type, required attributes and payload validity before accepting an entity. Lists, counts and activity use creator and project scoped local DuckDB SQL; RPC reads supply payloads only where needed. Stored widget SQL must pass `checkWidgetSql` before execution in the viewer's DuckDB, capped at 5,000 result rows.
