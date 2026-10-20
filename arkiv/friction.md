# Arkiv integration friction

These observations come from the Tiramisu spike and measurements of 18 October 2026 (recorded in SPECS §4), from building the widget and dashboard write paths on 19 and 20 October 2026, from tests run on 20 October 2026 for this report (WebSocket entity events, anonymous query cost, RPC access from Python), and from the workarounds now in the code. Each entry names the code that handles it.

Versions throughout: `@arkiv-network/sdk` 0.8.1, viem 2.57.7, Bun 1.3.11, Tiramisu chain ID 7738577 at `https://rpc.tiramisu.db-chain.testnet.arkiv.network`. The node server software version was not exposed. Reproduction requests spend provider budget.

## Arkiv surfaces used

| Surface | Where | Entries below |
| :--- | :--- | :--- |
| `arkiv_query` over direct JSON RPC, anonymous unless a key is configured | Indexer filler; browser live tail, Payload and Verify through the web `/api/rpc` read proxy | Anonymous budget, query length, flat cost |
| `arkiv_query` with an API key (opt in) | Indexer keyed sync and `BACKFILL_MODE=query` | Flat cost, monthly quota, keyed live sync |
| `eth_getLogs` on the Arkiv contract, decoded with SDK `ENTITY_EVENTS_ABI` | Indexer replay and live sync, browser live tail | Log result cap, keyed live sync, expiry without event |
| `eth_blockNumber`, `eth_chainId`, `eth_getBlockByNumber` | Indexer checkpoint and reorg checks, browser live head | Anonymous budget (these keep working) |
| SDK query builder (`key`, `eq`, `or`, `render`) | `packages/core/src/query.ts` | Query length |
| SDK wallet client (`executeBatch`, `createEntity`, `patchEntity`, `extendEntity`, `changeOwnership`, `predictEntityKeys`, `ExpirationTime`) | `apps/web/lib/dash/server/operations.ts` (app wallet), `apps/web/lib/dash/widget-actions.ts` (browser signed widget actions) | Mutation errors, create and transfer in one batch, extend at the cap |
| viem `custom` transport over the Privy embedded wallet | `apps/web/lib/dash/wallet.ts`, `apps/web/components/auth/PrivyBridge.tsx` | Wallet transport retries |
| Same origin read proxy `POST /api/rpc` | `apps/web/lib/dash/server/rpc-proxy.ts` | Anonymous budget exhausted again |
| SDK `watchEntityEvents` over the Tiramisu WebSocket RPC | Not used in the app; tested for this report | WebSocket entity events |
| Public RPC from a script (Python `urllib`) | `examples/verify_against_chain.py` | RPC rejects the default Python user agent |

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

SDK 0.8.1, viem 2.57.7, Bun 1.3.11, Tiramisu on 18 October 2026; server version unknown.

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

SDK 0.8.1, viem 2.57.7, Bun 1.3.11, authenticated Tiramisu on 18 October 2026; server version unknown.

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

Authenticated `arkiv_query` calls each cost 100 units according to `Arkiv-Cost: 100`. A single key, 50 OR keys, a full 200 row page and a failing call all showed the same cost. Anonymous calls show the same header: on 20 October 2026 at 01:55 UTC, one anonymous `$key = key(0x78d7…24376)` query with limit 1 and one anonymous query rejected by the parser (an untyped hex literal, code `-32001`) each returned `Arkiv-Cost: 100` and `RateLimit: limit=600, remaining=…, reset=60`. That per minute limit is not the hourly anonymous budget of 10,000 units, which no header reports, so the "about 100 anonymous queries an hour" we use elsewhere is 10,000 divided by the header cost, an estimate. The 18 October observation that one broad query exhausted the whole budget means the header does not always equal what is charged. The header alone does not describe monthly quota consumption (see the quota observations below). Chain wide churn makes one query per entity event unnecessarily costly.

Workaround: no `arkiv_query` runs per event anywhere. The indexer and browser batch up to 50 keys per query, and Payload and Verify are explicit user clicks.

### Versions

SDK 0.8.1, viem 2.57.7, Bun 1.3.11, authenticated Tiramisu on 18 October 2026; server version unknown.

### Steps to reproduce

1. Send an authenticated single key query and record `Arkiv-Cost`. Repeat it without a key and compare `Arkiv-Cost` and `RateLimit`.
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

SDK 0.8.1, viem 2.57.7, Bun 1.3.11, authenticated Tiramisu on 18 October 2026; server version unknown.

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

**Versions.** SDK 0.8.1, viem 2.57.7, Bun 1.3.11, Tiramisu on 18 October 2026.

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

**Actual.** A writer has to walk the `cause` chain of the thrown error, check `data.errorName` for `EntityNotFound` or `EntityExpired`, and fall back to matching message text (`No live entity with key`, `no entity 0x...`, `entity 0x... expired at block`).

Workaround: `apps/web/lib/dash/server/operations.ts` and `apps/web/lib/dash/widget-actions.ts` match these names and messages (the server walks the `cause` chain and returns not found; the browser maps them to an expired widget error). (The original workaround lived in the removed demo writer.)

**Versions.** SDK 0.8.1, viem 2.57.7, Bun 1.3.11, Tiramisu.

**Steps to reproduce.** Call `patchEntity` or `extendEntity` on an entity key after it expired, and inspect the thrown error and its `cause` chain.

**Suggested fix.** Export typed error classes or a stable `code` for missing and expired entities from the SDK mutation helpers.

## Write surfaces and budgets, 19 and 20 October 2026

These entries cover the widget and dashboard write paths and the read budget hit while building them. Two are tested paths that worked; they use the same four parts.

Versions for this section: `@arkiv-network/sdk` 0.8.1, viem 2.57.7, `@privy-io/react-auth` 3.50.0, Next.js 16.4.2, Bun 1.3.11, Tiramisu chain ID 7738577.

### Create and transfer in one batch with predicted keys (tested path that worked)

**Expected.** A server wallet should be able to create a widget and hand it to the user's wallet atomically, so the widget is never left owned by the app. The SDK docs should say whether an `ownershipChanges` entry may name a key created earlier in the same `executeBatch`.

**Actual.** The `executeBatch` docs (`clients/decorators/arkivWallet.ts`) show `ownershipChanges` only for an existing key, and the `predictEntityKeys` example (`clients/decorators/arkivPublic.ts`) covers a create that references another create through an attribute. The source shows the native order is creates, patches, deletes, extensions, ownership changes (`utils/arkivTransactions.ts`), so we tried it and it works: transaction `0xa3668515f09911d190336e92457afba8759f79f3f18870e7d5a33f7cd7a21f03` at block 803,198 emits `EntityCreated` and then `OwnershipTransferred` for widget `0x78ca2e9ea9f292bc81a6356a89d7e73eddb6f491916209d673b6ec724b22be23`. The entity reads back with creator `0x1f61c3cac1612c020f64739b128c5f198939c8cd` (app wallet), owner `0x2f4d9088ff069c17c2ae6c051e3c78911b827757` (Privy embedded wallet) and `creationFlags.raw = 3`. The same pattern creates a widget plus its dashboard link with `count: 2`, the link holding the predicted widget key. The one trap is in the docs: a prediction "holds only while nothing else from this owner is in flight".

Workaround: `createWidget` in `apps/web/lib/dash/server/operations.ts` calls `predictEntityKeys` and `executeBatch` inside one slot of a serial write queue (`apps/web/lib/dash/server/queue.ts`), and each create carries the salt it was predicted with. DEVELOPER.md tells operators not to run the seed script during user traffic, because that process has its own queue.

**Versions.** As above; written on Tiramisu on 20 October 2026.

**Steps to reproduce.**

1. With a funded wallet client, call `predictEntityKeys({ owner: account.address, count: 1 })`.
2. Call `executeBatch({ creates: [{ payload, contentType, attributes, expires, flags: { readonly: true, permissionlessExtension: true }, salt: predicted[0].salt }], ownershipChanges: [{ entityKey: predicted[0].key, newOwner }] })`.
3. Read `eth_getLogs` for that block on `0x4400000000000000000000000000000000000044` and `arkiv_query("$key = key(<predicted key>)")` with `owner`, `creator` and `creationFlags` selected.

**Suggested fix.** State in the `executeBatch` docs that patches, extensions and ownership changes may target keys created earlier in the same batch, and consider an `owner` field on a create so a hand over needs no transfer.

### Wallet transport retries can resend a signed write

**Expected.** A write signed by the Privy embedded wallet through a viem `custom` transport is sent once; if the wallet returns an error, the user sees it.

**Actual.** viem `createTransport` defaults to `retryCount = 3` (`clients/transports/createTransport.ts`), `custom()` inherits it (`clients/transports/custom.ts`), and `buildRequest` retries any method, including `eth_sendTransaction`, when `shouldRetry` matches (code `-1`, `-32603`, `-32005`, `429`, `-32007`, or HTTP 403, 408, 413, 429, 500 and above) (`utils/buildRequest.ts`). Privy is configured with `showWalletUIs: false` (`apps/web/components/auth/PrivyBridge.tsx`), so the embedded wallet signs without a prompt and a retry would be invisible. We found this by reading the source after the first wallet signing commit (`f114090`), not from an observed duplicate, and turned retries off 17 minutes later (`67904b9`). A probe against viem 2.57.7 with a provider that throws on `eth_sendTransaction` confirmed it: with defaults the provider is called 4 times for code `-32603` and for `-1`, once for `4001` (user rejected); with `{ retryCount: 0 }` it is called once in every case.

Workaround: `splitTransport` in `apps/web/lib/dash/wallet.ts` routes wallet methods to the Privy provider and reads to the public RPC, and passes `{ retryCount: 0 }` to `custom()` and to the `http()` side. Errors map to fixed copy through `walletErrorKind` in `apps/web/lib/dash/widget-actions.ts`.

**Versions.** viem 2.57.7, `@privy-io/react-auth` 3.50.0, SDK 0.8.1, Next.js 16.4.2; probe run with Bun 1.3.11 on 20 October 2026.

**Steps to reproduce.**

1. `createWalletClient({ transport: custom(provider) })` where `provider.request` throws `{ code: -32603 }` for `eth_sendTransaction` and counts calls.
2. Send `client.request({ method: 'eth_sendTransaction', params: [...] })` and catch the error. The count is 4.
3. Repeat with `custom(provider, { retryCount: 0 })`. The count is 1.

**Suggested fix.** The Arkiv SDK docs for browser wallets should recommend `retryCount: 0` on wallet transports, or the SDK wallet client should not retry non idempotent methods. viem could exclude `eth_sendTransaction` and `eth_sendRawTransaction` from transport retries by default.

### Extend at the cap and `ExpiryNotExtended`

**Expected.** Extending an entity to a block that is not later than its current expiry should be detectable before sending, or fail with a typed SDK error.

**Actual.** `extendEntity` sets an absolute expiry, it does not add to it, and the engine reverts `ExpiryNotExtended(entityKey, newExpiresAt, currentExpiresAt)` when the target is not later (`utils/arkivTransactions.ts`). The SDK only renders it as text, "already expires at block N, so extending it to M would shorten its life" (`utils/revert.ts`). This matters with `permissionlessExtension`: two viewers can extend the same widget, and the second computes its target from an `expiresAt` that has already moved. Our widgets also stop at an app cap of 90 days remaining, so near the cap the target can equal the current expiry.

Workaround: `extendTarget` in `apps/web/lib/dash/time.ts` computes `min(expiresAt + lifetimeDays * 43200, head + 90 * 43200)`. `extendWidgetDirect` in `apps/web/lib/dash/widget-actions.ts` reads the head first and refuses to send when the widget has expired or `target <= expiresAt` (`at_cap`), and `walletErrorKind` maps an `ExpiryNotExtended` revert or the "would shorten its life" text to the same `at_cap` message, "Already at the 90 day maximum". Organize and the Featured keepalive only include an extension when the target is later (`planOrganize`, `keepOfficialAlive`). `apps/web/test/dash-wallet.test.ts` pins both paths.

**Versions.** SDK 0.8.1, viem 2.57.7, `@privy-io/react-auth` 3.50.0; behavior read from the SDK source on 20 October 2026. We did not spend gas to trigger the revert on chain.

**Steps to reproduce.**

1. Read a live entity you may extend and note `expiresAt`.
2. Call `extendEntity({ entityKey, expires: ExpirationTime.atBlock(expiresAt) })`.
3. Inspect the thrown `EntityMutationError` and its `cause` chain for `ExpiryNotExtended`.

**Suggested fix.** Export typed error classes (or a stable `code`) for `ExpiryNotExtended`, and offer a relative helper such as "extend by N blocks, never shorten" so concurrent permissionless extends cannot collide.

### Anonymous budget exhausted again on 20 October

**Expected.** Widget pages read a few payloads per view and should not run out of read budget during normal browsing.

**Actual.** Until 20 October the browser sent its reads (widget payloads by `$key` chunks of 50, Explore previews in pages of 12, live tail attributes) straight to the public RPC, so every visitor spent their own anonymous budget. While building the widget pages on 20 October those reads failed with HTTP 429 and the plain object body `{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}`. It happened again while writing this report: shortly after 07:00 IST on 20 October 2026 the first `arkiv_query` of this session sent straight to the public RPC returned that body, while the same query through a local `/api/rpc` succeeded.

Workaround, in two commits on 20 October: `3857bd1` shows "RPC budget exhausted, retry later" and a widget page notice instead of a raw error and never retries automatically (`rpcMessage` in `apps/web/components/RowActions.tsx`, `apps/web/components/widgets/WidgetPage.tsx`), and `42f48e6` routes every browser read through the same origin read proxy `POST /api/rpc` (`apps/web/lib/dash/server/rpc-proxy.ts`), which adds the server side `TIRAMISU_API_KEY` when set. Without a key, all visitors share the web server's anonymous budget, which is worse, so a production deployment should set the key.

**Versions.** SDK 0.8.1 (the browser client is direct JSON RPC in `packages/core/src/rpc.ts`), Next.js 16.4.2, Tiramisu on 20 October 2026; server version unknown.

**Steps to reproduce.**

1. From one IP with no API key, send `arkiv_query` requests to `https://rpc.tiramisu.db-chain.testnet.arkiv.network` (for example the app wallet scope `$creator = addr(0x1f61c3cac1612c020f64739b128c5f198939c8cd)` with `limit` 200) until one returns HTTP 429.
2. Read the body and the `Retry-After` header.
3. Send the same body to `POST /api/rpc` of a deployment with `TIRAMISU_API_KEY` set and compare.

**Suggested fix.** Offer a publishable, origin restricted key that a browser may hold, so apps do not need a proxy, and document the anonymous cost of each `arkiv_query` shape.

### Keyless attribute fill backlog (tested path that worked)

**Expected.** A mirror that never sends an API key should still converge to full attributes for every live entity.

**Actual.** It converges, slowly. Backfill publishes every live entity from public logs at once with `attrs_pending = true`, then the filler fetches attributes for up to 50 keys per `arkiv_query` every 4 seconds, newest `updated_at` first, and pauses on HTTP 429 until `Retry-After` (`apps/indexer/src/fill.ts`). At an estimated 100 anonymous queries an hour (10,000 units over `Arkiv-Cost: 100`, see [Flat query cost](#flat-query-cost-and-batching-guidance)) that is at most about 5,000 keys an hour, while about 2,800 distinct keys change per hour (see [Keyed live sync](#keyed-live-sync-does-not-fit-the-monthly-quota)) and every create or patch marks a key pending again. The hosted indexer reported `{"headBlock":805105,"live":36457,"pending":809}` on `/health` on 20 October 2026, so 2.2 percent of live entities were still waiting for attributes. Rows stay queryable meanwhile: system columns come from logs, and the status bar shows the block from which on every changed entity has its attributes (older ones are still loading, newest first).

Workaround: none needed beyond what is built. `FILL_USE_API_KEY=true` sends fills with a key for a faster catch up.

**Versions.** SDK 0.8.1, Bun 1.3.11, `@duckdb/node-api` 1.5.6-r.1, Tiramisu on 20 October 2026.

**Steps to reproduce.**

1. Start the indexer with an empty data directory and no API key (`DATA_DIR=./data bun apps/indexer/src/main.ts`).
2. Poll `http://localhost:8080/health` and record `live` and `pending` over time.
3. Run `SELECT count(*) FROM entities WHERE attrs_pending` in the Playground of a local app pointed at that indexer.

**Suggested fix.** The same as for keyed live sync: put attribute values (or a content hash) in `EntityCreated` and `EntityPatched` logs, or offer an unmetered bulk attribute read, so a keyless mirror is never behind.

## Tests run for this report, 20 October 2026

Versions for this section: `@arkiv-network/sdk` 0.8.1, viem 2.57.7 (the copy the SDK resolves), Bun 1.3.11, Python 3.14.7 with duckdb 1.5.6, DuckDB CLI 1.5.5, macOS, Tiramisu chain ID 7738577.

### WebSocket entity events (tested path, gap on reconnect)

**Expected.** `client.watchEntityEvents(...)` on a public client with `webSocket()` transport and no `fromBlock` should push every entity event as blocks arrive, without a polling loop, and after a dropped connection it should either resume where it stopped or say clearly that events were missed.

**Actual.** While connected it works well. The SDK passes `pollingInterval` but no `poll` flag to viem `watchEvent`, and viem picks `eth_subscribe` for a WebSocket transport when no `fromBlock` is given (`actions/public/watchEvent.ts`, `enablePolling`), so the transport is a push subscription. In two runs of 70 seconds each against `wss://rpc.tiramisu.db-chain.testnet.arkiv.network` (the URL in the SDK `tiramisu` chain definition), events arrived as one batch per block, every 2.0 seconds, for each of the 14 and 15 consecutive blocks before the forced disconnect and each block after it, decoded with block, transaction and log index. Outside the reconnect window every log that `eth_getLogs` returned over HTTP was delivered, with no duplicates. To test reconnect, the script closed the raw socket at 30 seconds (`(await client.transport.getRpcClient()).socket.close()`). viem reconnected and resubscribed by itself, and `onError` received three `SocketClosedError: The socket has been closed.` and one `WebSocketRequestError: WebSocket request failed.` Events resumed after about 4 seconds, but at the new head: the blocks in between were never delivered.

| Run (UTC) | Blocks covered | Events received | `eth_getLogs` for the same range | Missing | Missing blocks |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 01:59:57 | 805,917 to 805,950 | 62 | 65 | 3 | 805,931 and 805,932 (during the reconnect) |
| 02:01:22 | 805,959 to 805,993 | 70 | 72 | 2 | 805,974 (during the reconnect) |

So the subscription is a good live signal but not a complete feed by itself. A consumer has to remember the last block it saw and fill the gap with `eth_getLogs` after every `onError`, which is the checkpointed window loop the indexer and browser already run. Passing `fromBlock` to replay switches viem to polling, so there is no SDK option for "subscribe, and replay what I missed".

Workaround: none needed in the app, which never used the watcher. The indexer and the browser live tail poll `eth_getLogs` in explicit windows from a stored checkpoint (`apps/indexer/src/sync.ts`, `apps/web/lib/live-tail.ts`); a reconnect there cannot skip a block, because the next window starts at the checkpoint (SPECS §5).

**Steps to reproduce.**

1. `createPublicClient({ chain: tiramisu, transport: webSocket(tiramisu.rpcUrls.default.webSocket[0]) })` from `@arkiv-network/sdk` and `viem`.
2. `client.watchEntityEvents({ onEvent, onError })` and record each event's `blockNumber`, `transactionHash` and `logIndex`.
3. After 30 seconds call `(await client.transport.getRpcClient()).socket.close()`, keep watching 40 more seconds, then `unwatch()`.
4. Fetch `eth_getLogs({ address: 0x4400000000000000000000000000000000000044, fromBlock: <first seen>, toBlock: <last seen> })` over HTTP and compare by transaction hash and log index. The missing logs sit in the blocks mined during the reconnect.

**Suggested fix.** In `watchEntityEvents`, remember the last delivered block and, when the subscription is re-established, fetch `eth_getLogs` from the next block before delivering live events (or emit a typed "gap" error naming the block range). Document in the SDK that `onError` during a WebSocket watch means events may have been missed.

### RPC rejects the default Python user agent

**Expected.** A plain HTTPS JSON RPC POST works from any HTTP client, so an analyst's script can query Arkiv with the standard library.

**Actual.** `urllib.request` from Python 3.14.7 got HTTP 403 from `https://rpc.tiramisu.db-chain.testnet.arkiv.network` for `arkiv_query`. The same `eth_blockNumber` body returned 403 with `User-Agent: Python-urllib/3.14`, and 200 with `curl/8.7.1` or a custom agent such as `arkiv-sql-indexer-example/1` (checked with curl on 20 October 2026 at 01:58 UTC). The 403 body is not a JSON RPC error, so the script only sees an HTTP error. The response comes from Cloudflare (`server: cloudflare`). The hosted indexer, which also serves through a proxy, accepted the default Python agent.

Workaround: `examples/verify_against_chain.py` sends `user-agent: arkiv-sql-indexer-example/1`.

**Steps to reproduce.**

1. `curl -s -o /dev/null -w '%{http_code}' -A 'Python-urllib/3.14' -XPOST https://rpc.tiramisu.db-chain.testnet.arkiv.network -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'` prints 403.
2. Repeat with `-A 'curl/8.7.1'`; it prints 200.

**Suggested fix.** Allow the default agents of common HTTP libraries on the public RPC, or document the rule and return a JSON body that says why the request was refused.
