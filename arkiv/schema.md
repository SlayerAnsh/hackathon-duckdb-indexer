# Demo entity schema

The support desk writer uses Arkiv SDK 0.8.1 on Tiramisu, chain ID 7738577. All entities have `contentType: text/plain`. Payload text stays on chain and is fetched on demand, never stored in Parquet.

## Attributes and expiry

| Entity type | Attribute | Arkiv type | Value or purpose |
| :--- | :--- | :--- | :--- |
| ticket | type | str | `ticket` |
| ticket | project | str | `arkiv-sql-indexer-demo` |
| ticket | title | str | Synthetic ticket title |
| ticket | status | str | `open`, `pending`, or `closed` |
| ticket | priority | u64 | 1, 2, or 3 |
| ticket | assignee | addr | Agent address, absent until assignment |
| comment | type | str | `comment` |
| comment | project | str | `arkiv-sql-indexer-demo` |
| comment | ticket | key | Parent ticket entity key |
| heartbeat | type | str | `heartbeat` |
| heartbeat | project | str | `arkiv-sql-indexer-demo` |

| Type | Requested expiry | Operations |
| :--- | :--- | :--- |
| ticket | 7 days, 604800 seconds | Created with first comment in `executeBatch`; `patchEntity` changes status or sets assignee; `changeOwnership` transfers to agent; later comments call `extendEntity` with 7 days |
| comment | 1 day, 86400 seconds | First comment created in ticket batch; later comments use `createEntity` and then extend the ticket in a separate transaction |
| heartbeat | 10 minutes, 600 seconds | `createEntity`; disappears through expiry without an event |

Expiry is requested with `ExpirationTime.fromSeconds`; the returned `expiresAt` is a block number. Extension uses SDK lease semantics rather than a locally calculated timestamp. After transfer the writer stops mutating that ticket because it no longer owns it. The demo does not explicitly delete entities.

Every entity also has system fields `key`, `owner`, `creator`, `createdAt`, `updatedAt`, `expiresAt`, `contentType`, and `creationFlags`. Public SQL exposes these as `key`, `owner`, `creator`, `created_at`, `updated_at`, `expires_at`, `content_type`, and `creation_flags`. Block numbers are numeric; addresses and keys use lowercase hex. The `attributes` view contains `key`, `name`, `type`, `value`, and approximate numeric `num`. Exact integers are preserved as decimal text in `value`. SQL reads the public `entities` and `attributes` views; attributes follow only the winning live entity version.

## Exact query shapes

The configured demo expression is:

```text
$creator = addr(0x1f61c3cac1612c020f64739b128c5f198939c8cd)
```

Backfill sends `arkiv_query(INDEX_EXPRESSION, options)` pinned to `atBlock` equal to chain head minus `CONFIRMATIONS`, default 3 confirmations, with `limit: 200` and cursor pagination at that same block. The selection is exactly:

```json
{"key":true,"owner":true,"creator":true,"createdAt":true,"updatedAt":true,"expiresAt":true,"creationFlags":true,"contentType":true,"attributes":true}
```

Live sync renders keys through SDK `eq`, `or`, and `render`, in chunks of at most 50. For two example keys the exact expression is:

```text
($creator = addr(0x1f61c3cac1612c020f64739b128c5f198939c8cd)) AND ($key = key(0x0000000000000000000000000000000000000000000000000000000000000001) OR $key = key(0x0000000000000000000000000000000000000000000000000000000000000002))
```

Use the backfill selection, `atBlock` equal to the batch end, and pagination if returned. A single key keeps the outer chunk parentheses but has no `OR`. Returned keys replace their attributes; missing keys become tombstones. No `arkiv_query` call is needed for a batch with no relevant keys. Event discovery uses `eth_getLogs`, not an Arkiv predicate.

The browser payload action uses this expression at current head, without the configured creator expression or an `atBlock`:

```text
$key = key(0x0000000000000000000000000000000000000000000000000000000000000001)
```

Payload selection is `{"payload":true,"contentType":true}`. The verify action uses the same bare key predicate, or an `OR` of up to 50 such predicates for multiple keys, and selection `{"key":true,"updatedAt":true,"expiresAt":true,"owner":true}` with cursor pagination. Neither action passes an explicit limit. These requests go directly to the visitor's RPC, not through the indexer. Verify compares returned metadata and the live head; it is an RPC comparison, not a cryptographic proof. A missing entity cannot distinguish deletion from expiry.

The browser also uses `eth_blockNumber` and chain identity reads. It does not run an Arkiv query per event. The SDK `getEntity` convenience method itself uses a key predicate with full selection and limit 1; there is no separate `arkiv_getEntity` RPC.
