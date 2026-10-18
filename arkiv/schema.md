# Arkiv schema and queries

This file lists the entity types the demo writer creates, their attributes and expiry, and every Arkiv RPC request the indexer and the browser send. Network: Tiramisu, chain ID 7738577, RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`. SDK: `@arkiv-network/sdk` 0.8.1 with viem 2.57.3.

The indexer itself is schema agnostic. It mirrors every live entity that matches `INDEX_EXPRESSION` (blank means every entity on the chain), whatever its attributes. The support desk below is the demo data set, written by `apps/demo-writer`.

## Entity types and attributes

Every demo entity has `contentType: text/plain` and the attributes `type` and `project`. Payload text stays on chain and is fetched on demand by the browser; it is never stored in Parquet.

| Entity type | Attribute | Arkiv type | Value or purpose |
| :--- | :--- | :--- | :--- |
| ticket | type | str | `ticket` |
| ticket | project | str | `arkiv-sql-indexer-demo` |
| ticket | title | str | Synthetic title such as `Coral portal` |
| ticket | status | str | `open` at creation, later patched to `open`, `pending`, or `closed` |
| ticket | priority | u64 | 1, 2, or 3 |
| ticket | assignee | addr | Agent address, absent until assignment |
| comment | type | str | `comment` |
| comment | project | str | `arkiv-sql-indexer-demo` |
| comment | ticket | key | Entity key of the parent ticket |
| heartbeat | type | str | `heartbeat` |
| heartbeat | project | str | `arkiv-sql-indexer-demo` |

Payloads: a ticket has an empty payload. A comment carries its text (`Synthetic support request for the demo console.` for the first comment, `Synthetic diagnostic check completed.` for later ones). A heartbeat has an empty payload.

Creation flags: tickets are created with `permissionlessExtension: true`, so any account can extend them. Comments and heartbeats use default flags.

## Expiration per type and operations

| Type | Requested expiry | Operations |
| :--- | :--- | :--- |
| ticket | 7 days, 604800 seconds | Created together with its first comment in one `executeBatch`. Keys come from `predictEntityKeys`, so the comment's `ticket` attribute can reference the parent inside the same batch. `patchEntity` sets `status`, or sets `assignee` just before `changeOwnership` transfers the ticket to that agent. Each later comment calls `extendEntity` on the ticket with 7 days, a lease renewed by activity. |
| comment | 1 day, 86400 seconds | The first comment is created in the ticket batch. Later comments use `createEntity`, then extend the parent ticket in a separate transaction. |
| heartbeat | 10 minutes, 600 seconds | `createEntity`. It disappears through expiry without any event, which makes expiry visible within a demo. |

Expiry is requested with `ExpirationTime.fromSeconds`; the chain stores `expiresAt` as a block number (one block is 2 seconds). The demo never deletes entities explicitly.

After a transfer the writer no longer owns the ticket, so it stops patching it (status changes and assignment pick only unassigned tickets). Comments on a transferred ticket still extend it, which works because of the `permissionlessExtension` flag. Each action picks one of: open ticket (25 percent), comment (35), set status (15), assign (10), heartbeat (15). One action runs every `DEMO_INTERVAL_MS` (default 8000 ms).

## SQL columns

Every entity also has the system fields `key`, `owner`, `creator`, `createdAt`, `updatedAt`, `expiresAt`, `contentType` and `creationFlags`. Public SQL exposes two views:

* `entities`: `key`, `owner`, `creator`, `created_at`, `updated_at`, `expires_at`, `content_type`, `creation_flags`, `attrs_pending`.
* `attributes`: `key`, `name`, `type`, `value`, `num`.

Block numbers are numeric. Addresses and keys are lowercase hex. `value` is canonical text (decimal for `u64`, `u256`, `i32` and `dec`; lowercase `0x` hex for `addr`, `key` and `bytes32`). `num` is an approximate DOUBLE for numeric types and `bool`. `attrs_pending` is true for rows written from log data whose attributes are not fetched yet; these rows have no attribute rows. `attributes` follows only the winning live entity version. Both views hide rows with `expires_at <= live_head`.

## Exact Arkiv queries

All requests are direct JSON RPC POSTs built by `packages/core/src/rpc.ts`. `atBlock` and `limit` are sent as hex quantities. `$key` predicates are rendered with SDK `key`, `eq`, `or` and `render`, in chunks of at most 50 keys (`packages/core/src/query.ts`).

The demo expression is:

```text
$creator = addr(0x1f61c3cac1612c020f64739b128c5f198939c8cd)
```

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
