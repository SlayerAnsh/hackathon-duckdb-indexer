# Arkiv integration friction

These observations come from the Tiramisu spike and measurements of 18 October 2026 (recorded in SPECS §4) and from the workarounds now in the code. Each entry names the code that handles it.

Versions throughout: `@arkiv-network/sdk` 0.8.1, viem 2.57.3, Bun 1.3.11, Tiramisu chain ID 7738577 at `https://rpc.tiramisu.db-chain.testnet.arkiv.network`. The node server software version was not exposed. Reproduction requests spend provider budget.

## Arkiv surfaces used

| Surface | Where | Entries below |
| :--- | :--- | :--- |
| `arkiv_query` over direct JSON RPC, anonymous | Indexer filler, browser live tail, Payload, Verify | Anonymous budget, query length, flat cost |
| `arkiv_query` with an API key (opt in) | Indexer keyed sync and `BACKFILL_MODE=query` | Flat cost, monthly quota, keyed live sync |
| `eth_getLogs` on the Arkiv contract, decoded with SDK `ENTITY_EVENTS_ABI` | Indexer replay and live sync, browser live tail | Log result cap, keyed live sync, expiry without event |
| `eth_blockNumber`, `eth_chainId`, `eth_getBlockByNumber` | Indexer checkpoint and reorg checks, browser live head | Anonymous budget (these keep working) |
| SDK query builder (`key`, `eq`, `or`, `render`) | `packages/core/src/query.ts` | Query length |
| SDK wallet client (`executeBatch`, `createEntity`, `patchEntity`, `extendEntity`, `changeOwnership`, `predictEntityKeys`, `ExpirationTime`) | `apps/demo-writer` | Mutation errors |

## Anonymous query budget and error envelope

### Expected

A selective, small response should leave room for further anonymous queries. RPC failures should use a JSON RPC error envelope that clients can decode consistently.

### Actual

One broad `$expiresAt > u64(0)` query with limit 5 exhausted the anonymous 10000 unit budget. Later queries returned HTTP 429 with a plain object instead of a JSON RPC envelope:

```json
{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}
```

`eth_blockNumber`, `eth_getLogs`, `arkiv_getEntityCount` and `arkiv_getBlockTiming` still worked. Headers indicated a reset after about an hour.

Workaround: `packages/core/src/rpc.ts` accepts both shapes (an object `error` with `code` and `message`, or a string `error` plus top level `message`) and keeps `Retry-After`. The filler and browser live tail pause only attribute fetches on 429.

### Versions

SDK 0.8.1, viem 2.57.3, Bun 1.3.11, Tiramisu on 18 October 2026; server version unknown.

### Steps to reproduce

1. Use an unauthenticated Tiramisu caller with available anonymous budget.
2. POST `arkiv_query` with expression `$expiresAt > u64(0)` and options `{"limit":5,"select":{"key":true}}`.
3. Repeat the request and inspect the HTTP status, `RateLimit`, `Retry-After` and `Arkiv-Cost` headers and the body. Shared caller budget can affect the starting state.
4. Call `eth_blockNumber` to compare method availability after exhaustion.

### Suggested fix

Document anonymous cost accounting and safe query patterns before the first request. Return a consistent JSON RPC error envelope, or document and type the HTTP error object in the SDK. Until then clients must handle non envelope 429 responses without assuming `error.code` exists.

## Undocumented query length ceiling

### Expected

The expression length or key term limit should be documented, so clients can chunk without paid failures.

### Actual

An OR of 50 key terms (about 4,100 characters) worked. An OR of 100 terms (about 8,200 characters) failed with code `-32004` and message `query is too long`. This brackets the limit; it does not establish an exact character threshold. Failed queries also cost units.

Workaround: `keyChunkQueries` defaults to 50 keys per query, and `apps/indexer/src/config.ts` rejects `FILL_CHUNK` above 50.

### Versions

SDK 0.8.1, viem 2.57.3, Bun 1.3.11, authenticated Tiramisu on 18 October 2026; server version unknown.

### Steps to reproduce

1. Create 100 valid 32 byte entity keys and render `$key` equality terms with SDK `key`, `eq`, `or` and `render`.
2. Query the OR of the first 50 with an API key and record the expression length and response.
3. Query the OR of all 100 with the same options and inspect the error. Existing entities are not required to test parser length.

### Suggested fix

Publish the exact byte or term limit, and expose a provider capability or an SDK chunk helper. A longer configured expression still adds to the total length of each chunk.

## Flat query cost and batching guidance

### Expected

Pricing guidance should explain whether selection size, page size and key count affect cost, with an efficient reference client pattern.

### Actual

Authenticated `arkiv_query` calls each cost 100 units according to `Arkiv-Cost: 100`. A single key, 50 OR keys, a full 200 row page and a failing call all showed the same cost. The header alone does not describe monthly quota consumption (see the quota observations below). Chain wide churn makes one query per entity event unnecessarily costly.

Workaround: no `arkiv_query` runs per event anywhere. The indexer and browser batch up to 50 keys per query, and Payload and Verify are explicit user clicks.

### Versions

SDK 0.8.1, viem 2.57.3, Bun 1.3.11, authenticated Tiramisu on 18 October 2026; server version unknown.

### Steps to reproduce

1. Send an authenticated single key query and record `Arkiv-Cost`.
2. Send a 50 key OR query and a selective 200 row page with full selection.
3. Compare the cost headers, then compare a known failing overlength query if budget permits.

### Suggested fix

Document the flat per call cost, whether failures are charged, and the preferred pattern: public log replay, relevance filtering from logs, and pinned batches of up to 50 keys.

## Monthly quota capacity is not exposed

### Expected

A client should be able to calculate remaining monthly calls and a sustainable polling rate from quota capacity, remaining units and reset time.

### Actual

`Arkiv-Quota-Used-Percent` was 1 after about 20 authenticated queries. Short term `RateLimit` data was available, but the monthly quota size was not exposed in the observed headers. A percentage alone cannot establish remaining calls.

Workaround: keyed clients log `Arkiv-Cost` and `Arkiv-Quota-Used-Percent` on every call (`createClients` in `apps/indexer/src/main.ts`), without logging the key.

### Versions

SDK 0.8.1, viem 2.57.3, Bun 1.3.11, authenticated Tiramisu on 18 October 2026; server version unknown.

### Steps to reproduce

1. Make authenticated queries and record `Arkiv-Cost`, `Arkiv-Quota-Used-Percent` and `RateLimit`.
2. Compare headers over several calls and look for monthly total units, remaining units and reset time.
3. Observe that the percentage and short term reset cannot determine monthly capacity.

### Suggested fix

Expose monthly capacity, remaining units and a reset timestamp in documented headers or a quota endpoint.

## Further observations

The entries below use the same four parts in a compact form.

### Public log replay and selective quota use

**Expected.** Bulk `eth_getLogs` should state its result cap, and a client should know which `arkiv_query` shapes consume the monthly quota.

**Actual.** Anonymous `eth_getLogs` worked from block zero without an API key and without an `Arkiv-Cost` header, and advertised `RateLimit: limit=600` per window. Above 20,000 results it returned `-32602` with a message such as `query exceeds max results 20000, retry with the range 725725-731557`. The suggested range is only available as free text. With an API key, broad 200 row pages consumed about 0.7% of the monthly quota per page, while ten keyed lookups of 50 keys with full selection did not move the percentage. This does not establish that key lookups are permanently free.

Workaround: `fetchLogsAdaptive` in `apps/indexer/src/replay.ts` parses `retry with the range A-B` from the message, retries exactly that range, then continues at B plus one. Without a suggested range it halves the window. HTTP 429 waits for Retry-After. The default backfill therefore spends no `arkiv_query` at all; attributes come from keyed fills.

**Versions.** SDK 0.8.1, viem 2.57.3, Bun 1.3.11, Tiramisu on 18 October 2026.

**Steps to reproduce.** Request anonymous logs for address `0x4400000000000000000000000000000000000044` over a block range large enough to exceed 20,000 results and read the error message. With an API key, compare `Arkiv-Quota-Used-Percent` before and after broad pinned pages and before and after batches of 50 key predicates.

**Suggested fix.** Return the suggested range in structured error `data`, and document the result cap and which query shapes count toward the monthly quota.

### Keyed live sync does not fit the monthly quota

**Expected.** A mirror should be able to stay current by looking up each changed entity.

**Actual.** Tiramisu showed 4,011 entity events in 1,800 blocks (about one hour), touching about 2,800 distinct keys per hour. Keyed live sync looks those keys up in chunks of at most 50 at every batch block, which would spend roughly 25 to 35 percent of the monthly quota per day, so the quota would last about three to four days. The anonymous budget allows about 100 queries of up to 50 keys per hour (about 5,000 keys). An `EntityPatched` log carries no attribute values, so every patch forces a query.

Workaround: the indexer never sends the API key by default (decision of 18 October 2026). Live sync applies creations, patches, extensions, transfers and deletions straight from public logs, and only attribute values come from anonymous key lookups, newest first. Patched entities briefly keep their previous attributes until the filler fetches them again. `SYNC_USE_API_KEY=true` restores keyed sync for deployments with a larger quota.

**Versions.** SDK 0.8.1, Tiramisu on 18 October 2026.

**Steps to reproduce.** Fetch `eth_getLogs` for 1,800 consecutive recent blocks, decode with SDK `ENTITY_EVENTS_ABI`, and count events and distinct `entityKey` values. Divide distinct keys by 50 to get queries per hour.

**Suggested fix.** Emit changed attribute values (or a content hash) in `EntityPatched` and `EntityCreated` logs, or offer an unmetered changes feed, so mirrors can stay current without a metered query per changed key.

### Expiry emits no event

**Expected.** A mirror should learn that an entity left the live set.

**Actual.** Expiry produces no log. A heartbeat with a 600 second lease simply stops being returned once `expiresAt` passes, so a log driven mirror would keep it forever.

Workaround: every indexer batch sweeps `expires_at <= batch end` and records tombstones, snapshots exclude expired rows, and the browser views filter against `eth_blockNumber`.

**Versions.** SDK 0.8.1, Tiramisu on 18 October 2026.

**Steps to reproduce.** Create an entity with `ExpirationTime.fromSeconds(600)`, then watch `eth_getLogs` on the Arkiv address past its `expiresAt` block. No event names its key.

**Suggested fix.** Document that expiry is silent and that mirrors must sweep by `expiresAt`, or offer an expiry feed.

### Mutation errors are not typed

**Expected.** A writer should detect "entity not found" or "entity expired" from a typed SDK error.

**Actual.** The demo writer has to walk the `cause` chain of the thrown error, check `data.errorName` for `EntityNotFound` or `EntityExpired`, and fall back to matching message text (`No live entity with key`, `no entity 0x...`, `entity 0x... expired at block`).

Workaround: `isGone` in `apps/demo-writer/src/writer.ts` does exactly this, then drops the ticket from local state.

**Versions.** SDK 0.8.1, viem 2.57.3, Bun 1.3.11, Tiramisu.

**Steps to reproduce.** Call `patchEntity` or `extendEntity` on a ticket key after it expired, and inspect the thrown error and its `cause` chain.

**Suggested fix.** Export typed error classes or a stable `code` for missing and expired entities from the SDK mutation helpers.
