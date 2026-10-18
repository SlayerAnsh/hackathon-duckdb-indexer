# Shared Context for All Plans

Every plan in this folder lists this file as required reading. Read it fully before starting a plan. The spec is `SPECS.md` at the repository root; plans cite its sections as `SPECS §N`.

## Project

Arkiv SQL Indexer. A Bun indexer mirrors Arkiv entities that match one query expression into versioned Parquet snapshots plus a per block JSON delta. A Next.js app proxies those files and loads them into DuckDB WASM in the browser, where users run SQL and see a dashboard. Deadline: 18 October 2026, 22:59 UTC. Prefer the simplest code that passes the tests.

## Execution rules

- Codex implements one plan per run. Claude reviews, installs dependencies, commits, and verifies.
- Codex has no network: it cannot install packages, reach Tiramisu, or bind sockets. All automated tests use fakes and fixtures. Anything needing the network is marked **[Claude]** in a plan and is run by Claude.
- Codex never runs mutating git commands (commit, checkout, rebase, reset, stash). Codex writes `CODEX-REPORT.md` in the checkout it works in: files changed, test output, open issues.
- Parallel plans run in full clones under `.claude/worktrees/<name>` inside the repository, never in sibling directories.
- Commits: no AI attribution lines of any kind.
- Docs (README, schema.md, friction.md, CHANGELOG.md, DEVELOPER.md): never use dashes as punctuation.

## Repository layout (Bun workspaces)

```
package.json                 workspaces: ["packages/*", "apps/*"]
tsconfig.base.json           strict, ES2022, moduleResolution bundler
packages/core/src/           shared types, RPC client, decoding, query helpers, merge view SQL
apps/indexer/src/            sync, snapshot, delta, HTTP
apps/web/                    Next.js App Router, output 'standalone'
apps/demo-writer/src/        synthetic writer using @arkiv-network/sdk
arkiv/schema.md, arkiv/friction.md
docker-compose.yml, .env.example
```

Package names: `@asi/core`, `@asi/indexer`, `@asi/web`, `@asi/demo-writer`. Import core as `@asi/core`.

## Tooling

- Runtime and tests: Bun 1.3.x, `bun test`. Node 22 must also run the indexer (keep to `@duckdb/node-api` and standard APIs; wrap `Bun.serve` in one file).
- DuckDB: `@duckdb/node-api` 1.5.x in the indexer and in core tests. `@duckdb/duckdb-wasm` in the browser.
- Arkiv SDK: `@arkiv-network/sdk` 0.8.1 (peer `viem` ^2.57.3 installed). Expression helpers `eq`, `or`, `and`, `render` come from `@arkiv-network/sdk/query`; value helpers such as `key`, `addr` from `@arkiv-network/sdk/attr`; `ENTITY_EVENTS_ABI` from `@arkiv-network/sdk`. Its source is in `packages/core/node_modules/@arkiv-network/sdk/src` (Bun isolated installs: each workspace has its own `node_modules`); read it rather than guessing (attribute value encodings in `src/attr/`, expression rendering in `src/query/expression.ts`, events in `src/actions/public/watchEntityEvents.ts`).
- Gotcha: `COPY ... TO 'path' (FORMAT parquet)` without `PARTITION_BY` writes one file at `path`. Always pass a full `.parquet` file path.
- Gotcha: DuckDB BIGINT and HUGEINT come back as strings or bigint in JS. Block numbers are stored as UBIGINT and converted with `Number()` (they stay below 2^53).

## Core interfaces (owned by plan 01, used by all)

```ts
// packages/core/src/types.ts
export type AttrType = 'str' | 'i32' | 'u64' | 'u256' | 'dec' | 'bool' | 'addr' | 'key' | 'bytes32'
export type EntityRow = {
  key: string; owner: string; creator: string            // lowercase 0x hex
  created_at: number; updated_at: number; expires_at: number   // block numbers
  content_type: string | null; creation_flags: number
}
export type AttributeRow = { key: string; name: string; type: AttrType; value: string; num: number | null }
export type Tombstone = { key: string; block: number }
export type Manifest = {
  chainId: number; genesisHash: string; expression: string
  version: number; snapshotBlock: number; headBlock: number
  files: { entities: string; attributes: string }   // paths relative to the data root
  delta: string                                      // "delta.json"
}
export type Delta = {
  fromBlock: number; toBlock: number
  entities: EntityRow[]; attributes: AttributeRow[]; tombstones: Tombstone[]
}

// packages/core/src/rpc.ts
export type RpcSelect = { key?: boolean; owner?: boolean; creator?: boolean; createdAt?: boolean;
  updatedAt?: boolean; expiresAt?: boolean; creationFlags?: boolean; contentType?: boolean;
  payload?: boolean; attributes?: boolean }
export type QueryPage = { data: RpcEntity[]; blockNumber: number; cursor?: string }
export interface ArkivRpc {
  query(expression: string, opts: { atBlock?: number; cursor?: string; limit?: number; select: RpcSelect }): Promise<QueryPage>
  blockNumber(): Promise<number>
  chainId(): Promise<number>
  genesisHash(): Promise<string>
}
export function createRpc(url: string, fetchImpl?: typeof fetch): ArkivRpc
export const ROW_SELECT: RpcSelect   // every field except payload

// packages/core/src/decode.ts
export function decodeEntity(e: RpcEntity): { entity: EntityRow; attributes: AttributeRow[] }

// packages/core/src/query.ts
export function keyChunkQueries(expression: string | null, keys: string[], chunkSize?: number): string[]
// returns `(${expression}) AND ($key = key(k1) OR $key = key(k2) ...)` per chunk (50 by default); null expression gives only the OR

// packages/core/src/views.ts  (owned by plan 04)
export const RAW_TABLES_SQL: string[]      // base_*, delta_*, live_head tables
export const MERGE_VIEWS_SQL: string[]     // entities, attributes views
export function setHeadSql(block: number): string[]
export function loadSnapshotSql(entitiesUrl: string, attributesUrl: string): string[]
```

`RpcEntity` is the type of that name in `@arkiv-network/sdk/src/types/rpcSchema.ts`; re-declare it locally in core if the SDK does not export it.

## Data root layout (indexer output, served under `/data/` by the web proxy)

```
<DATA_DIR>/<chainId>-<genesisHash first 10 hex chars>/
  index.duckdb
  manifest.json
  delta.json
  snap/v<n>/entities.parquet
  snap/v<n>/attributes.parquet
```

## Plan order

```
00 spike (done by Claude, results in SPECS §4)
01 core  ->  02 indexer backfill+snapshot  ->  03 indexer live+delta+http
         \->  04 merge views  ->  05 web data layer+proxy  ->  06 web UI (incl. P1 verify)
         \->  07 demo writer
03 + 06 + 07  ->  08 compose+docs
```

02, 04 and 07 can run in parallel after 01. 03 and 05 can run in parallel. The browser live tail is dropped (query budget, SPECS §4).

## Arkiv RPC facts that every plan relies on

- RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`, chain ID 7738577. API key env `TIRAMISU_API_KEY`, sent as `Authorization: Bearer <key>`. The key is server side only; never prefix it with `NEXT_PUBLIC_`.
- Query syntax: `AND`, `OR`, `NOT`, typed literals (`addr(0x..)`, `key(0x..)`, `str('..')`, `u64(..)`).
- Each `arkiv_query` costs 100 units flat. At most 50 `$key` terms per query (`-32004 query is too long` beyond).
- Errors: HTTP 429 with plain body `{"error":"ANON_COST_LIMITED",...}`, HTTP 401 `{"error":"INVALID_KEY",...}`, JSON-RPC errors with numeric codes.
