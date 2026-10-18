# Arkiv integration friction

These observations come from the verified Tiramisu spike on 18 October 2026 recorded in SPECS §4. They were not rerun during this offline documentation task. Versions throughout: Arkiv SDK `@arkiv-network/sdk` 0.8.1, viem 2.57.3, Bun 1.3.11, Tiramisu chain ID 7738577 at `https://rpc.tiramisu.db-chain.testnet.arkiv.network`. Node server software version was not exposed. Reproduction requests spend provider budget.

## Anonymous query budget and error envelope

### Expected

A selective, small response should leave room for additional anonymous queries. RPC failures should use a JSON RPC error envelope that SDK clients can consistently decode.

### Actual

One broad `$expiresAt > u64(0)` query with limit 5 exhausted the anonymous 10000 unit budget. Subsequent queries returned HTTP 429 with a plain object rather than a JSON RPC envelope:

```json
{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}
```

`eth_blockNumber`, `eth_getLogs`, `arkiv_getEntityCount`, and `arkiv_getBlockTiming` still worked. Headers indicated a reset after about an hour.

### Versions

SDK 0.8.1, viem 2.57.3, Bun 1.3.11, Tiramisu on 18 October 2026; server version unknown.

### Steps to reproduce

1. Use an unauthenticated Tiramisu caller with available anonymous budget.
2. POST `arkiv_query` with expression `$expiresAt > u64(0)`, options `{"limit":5,"select":{"key":true}}`.
3. Repeat the request and inspect HTTP status, `RateLimit`, `Retry-After`, `Arkiv-Cost`, and the response body. Shared caller budget can affect the starting state.
4. Call `eth_blockNumber` to compare method availability after exhaustion.

### Suggested fix

Document anonymous cost accounting and safe query patterns before the first request. Return a consistent JSON RPC error envelope, or explicitly document and type the HTTP error object in the SDK. Clients must handle non envelope 429 responses without assuming `error.code` exists.

## Undocumented query length ceiling

### Expected

The expression length or key term limit should be documented so clients can chunk without paid failures.

### Actual

An OR of 50 key terms, about 4,100 characters, worked. An OR of 100 terms, about 8,200 characters, failed with code `-32004` and message `query is too long`. This brackets the observed limit; it does not establish an exact character threshold. Failed queries also cost units.

### Versions

SDK 0.8.1, viem 2.57.3, Bun 1.3.11, authenticated Tiramisu on 18 October 2026; server version unknown.

### Steps to reproduce

1. Create 100 valid 32 byte entity keys and render `$key` equality terms with SDK `key`, `eq`, `or`, and `render`.
2. Query the OR of the first 50 with an API key and record the expression length and response.
3. Query the OR of all 100 with the same options and inspect the error. Existing entities are not required to test parser length.

### Suggested fix

Publish the exact byte or term limit and expose a provider capability or SDK chunk helper. This indexer defaults to 50 key terms per query; longer configured expressions can still increase total query length.

## Flat query cost and batching guidance

### Expected

Pricing guidance should explain whether selection size, page size, and key count affect cost, with an efficient reference client pattern.

### Actual

Authenticated `arkiv_query` calls each cost 100 units according to `Arkiv-Cost: 100`. A single key, 50 OR keys, a full 200 row page, and a failing call all had the same observed cost. The header alone does not describe monthly quota consumption. Chain wide churn makes a query for each entity event unnecessarily costly.

### Versions

SDK 0.8.1, viem 2.57.3, Bun 1.3.11, authenticated Tiramisu on 18 October 2026; server version unknown.

### Steps to reproduce

1. Send an authenticated single key query and record `Arkiv-Cost`.
2. Send a 50 key OR query and a selective 200 row page with full selection.
3. Compare the cost headers, then compare a known failing overlength query if budget permits.

### Suggested fix

Document flat per call cost, whether failures are charged, and the preferred pattern: public log replay, relevance filtering from logs, and pinned batches of up to 50 keys. Payload and verify should be explicit user actions. This project omits the browser live tail to avoid query amplification.

## Monthly quota capacity is not exposed

### Expected

A client should be able to calculate remaining monthly calls and a sustainable polling rate from quota capacity, remaining units, and reset time.

### Actual

`Arkiv-Quota-Used-Percent` was 1 after about 20 authenticated queries. Short term `RateLimit` data was available, but the monthly quota size was unknown and not exposed in the observed headers. A percentage alone cannot reliably establish remaining calls.

### Versions

SDK 0.8.1, viem 2.57.3, Bun 1.3.11, authenticated Tiramisu on 18 October 2026; server version unknown.

### Steps to reproduce

1. Make authenticated queries and record `Arkiv-Cost`, `Arkiv-Quota-Used-Percent`, and `RateLimit` headers.
2. Compare headers over several calls and look for monthly total units, remaining units, and reset time.
3. Observe that the percentage and short term reset cannot determine monthly capacity.

### Suggested fix

Expose monthly capacity, remaining units, and reset timestamp in documented headers or a quota endpoint. Keep API credentials server side and log cost and percentage without logging the key. Configure conservative batch intervals until capacity is known.


## Public replay and selective monthly quota observations

Measured on Tiramisu on 18 October 2026 with SDK 0.8.1: the flat `Arkiv-Cost: 100` header appeared for both broad scans and keyed queries, while broad 200 row pages consumed about 0.7% of monthly quota per page. Ten keyed lookups of 50 keys with full selection did not move the quota percentage. This observation does not establish that key lookups are permanently free.

Anonymous `eth_getLogs` worked from block zero without an API key or an Arkiv-Cost header. The response advertised `RateLimit: limit=600` per window. Above 20,000 results it returned `-32602` with a helpful message such as `query exceeds max results 20000, retry with the range 725725-731557`. Retry that exact range first, then continue at its end plus one. Without a suggested range, halve the block window. On HTTP 429 obey Retry-After.

To reproduce, compare quota headers before and after broad pinned pages and batches of 50 key predicates, then request anonymous logs over a range large enough to exceed 20,000 results. The default backfill now discovers live keys from public logs and spends backend queries only on keyed row lookups.

## Keyed live sync does not fit the monthly quota

Measured on Tiramisu on 18 October 2026: 4,011 entity events in 1,800 blocks (about one hour), touching about 2,800 distinct keys per hour. Keyed live sync looks those keys up in chunks of at most 50 at every batch block, and at that rate it would spend roughly 25 to 35 percent of the monthly quota per day, so the quota would last about three to four days. The anonymous budget allows about 100 queries of up to 50 keys per hour (about 5,000 keys), which covers the live change rate with room left for the backfill.

The indexer therefore never sends the API key by default (decision of 18 October 2026). Live sync applies creations, patches, extensions, transfers and deletions straight from public `eth_getLogs`, and only attribute values come from anonymous keyed lookups, newest first. A patch event carries no attribute values, so patched entities briefly keep their previous attributes until the filler fetches them again. `SYNC_USE_API_KEY=true` restores keyed sync for deployments with a larger quota.

Suggested fix: emit changed attribute values (or a content hash) in `EntityPatched` and `EntityCreated` logs, or offer an unmetered changes feed, so mirrors can stay current without a metered query per changed key.
