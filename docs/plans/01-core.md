# Plan 01: Workspace and Core Package

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md` (shared context, interfaces, rules)
2. `SPECS.md` §4 (verified RPC facts), §7.3 (row shapes)

**Goal:** Bun workspace skeleton plus `@asi/core` with types, a JSON-RPC client, entity decoding and key chunk query building.

**Architecture:** Pure TypeScript, no DuckDB. Every network call goes through an injectable `fetch`, so tests use fakes.

**Tech Stack:** Bun 1.3, TypeScript strict, `@arkiv-network/sdk` 0.8.1 (expression rendering only), `bun test`.

**Spec:** `SPECS.md`

## Review Focus

1. 429 responses whose body is `{"error":"ANON_COST_LIMITED",...}` (not a JSON-RPC envelope) must throw an `RpcError` carrying the HTTP status and the `error` code, never `undefined is not an object`.
2. JSON-RPC errors such as `{"code":-32004,"message":"query is too long"}` must throw `RpcError` with that code.
3. Uppercase hex in keys and addresses must be lowercased in `EntityRow` and `AttributeRow`.
4. `u256` values above 2^53 must keep exact text in `value` (decimal string) while `num` is an approximate double.
5. `keyChunkQueries` with zero keys returns `[]`, never a query with an empty `OR`.

---

### Task 1: Workspace skeleton

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`

- [ ] **Step 1:** Root `package.json` with `"private": true`, `"workspaces": ["packages/*", "apps/*"]`, script `"test": "bun test"`. `.gitignore` covers `node_modules`, `.next`, `data/`, `.env`, `.env.local`, `.claude/worktrees`, `*.duckdb`.
- [ ] **Step 2:** `packages/core/package.json` name `@asi/core`, `"main": "src/index.ts"`, `"types": "src/index.ts"`, dependency `@arkiv-network/sdk` `0.8.1`. **[Claude]** runs `bun install` before codex starts.
- [ ] **Step 3:** Verify `bun test` exits 0 with no tests found or one placeholder.

### Task 2: Types and RPC client

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/rpc.ts`
- Test: `packages/core/test/rpc.test.ts`

**Interfaces:**
- Produces: everything in CONTEXT.md under `types.ts` and `rpc.ts`, plus:
  - `class RpcError extends Error { status: number; code: string | number }`
  - `createRpc(url: string, opts?: { apiKey?: string; fetchImpl?: typeof fetch; onCost?: (cost: number, quotaUsedPercent: number | null) => void }): ArkivRpc`
  - `ArkivRpc.getLogs(fromBlock: number, toBlock: number): Promise<RawLog[]>` where `RawLog = { topics: string[]; data: string; blockNumber: number; logIndex: number; transactionHash: string }`, filtered on address `0x4400000000000000000000000000000000000044`.

- [ ] **Step 1: Write failing tests** with a fake `fetchImpl` that records requests and returns canned responses:
  - `sends bearer header when apiKey set`: request header `authorization` equals `Bearer k1`.
  - `query encodes atBlock and limit as hex`: `query('x', { atBlock: 742801, limit: 200, select: ROW_SELECT })` sends params `['x', { atBlock: '0xb5591', limit: '0xc8', select: {...} }]`; result `blockNumber` is a number.
  - `query passes cursor through` and returns `cursor` undefined when absent.
  - `throws RpcError on 429 plain body`: status 429, body `{"error":"ANON_COST_LIMITED","message":"..."}` gives `RpcError` with `status 429`, `code 'ANON_COST_LIMITED'`.
  - `throws RpcError on json-rpc error`: body `{"jsonrpc":"2.0","id":1,"error":{"code":-32004,"message":"query is too long"}}` gives `code -32004`.
  - `reports cost headers`: response headers `arkiv-cost: 100`, `arkiv-quota-used-percent: 1` call `onCost(100, 1)`.
  - `genesisHash reads block 0`: method `eth_getBlockByNumber` params `['0x0', false]`, returns `hash`.
  - `getLogs splits nothing and decodes numbers`: params use the Arkiv address and hex range; returned `blockNumber` and `logIndex` are numbers.
- [ ] **Step 2:** Run `bun test packages/core/test/rpc.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `types.ts` and `rpc.ts`. `ROW_SELECT` selects every field except `payload` and `attributeSchema`.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(core): types and json-rpc client`.

### Task 3: Decoding

**Files:**
- Create: `packages/core/src/decode.ts`
- Test: `packages/core/test/decode.test.ts`

**Interfaces:**
- Produces: `decodeEntity(e: RpcEntity): { entity: EntityRow; attributes: AttributeRow[] }`, `decodeAttribute(key: string, a: { name: string; type: string; value: unknown }): AttributeRow`

- [ ] **Step 1: Write failing tests.** Fixture is the real Tiramisu response:

```json
{"key":"0x95fad865481db04f4ee45c83421546b3a1b8adbdccce650ec445d17c61f4cd23","owner":"0x679b5ab1cd4b488d73025d0d72d4017fa2d97b59","creator":"0x679b5ab1cd4b488d73025d0d72d4017fa2d97b59","createdAt":"0xb55f4","updatedAt":"0xb55f4","expiresAt":"0xb5978","creationFlags":{"readonly":false,"permissionlessExtension":false,"raw":0},"contentType":"application/octet-stream","attributes":[{"name":"project","type":"str","value":"arkiv-chain-indexer-baseload"},{"name":"random_number_0_21eaaa3098b459fe","type":"u64","value":"0x6c9cfffaf132"}]}
```

  - `decodes entity row`: `created_at 742900`, `updated_at 742900`, `expires_at 743800`, `creation_flags 0`, `content_type 'application/octet-stream'`.
  - `decodes str`: `{ type: 'str', value: 'arkiv-chain-indexer-baseload', num: null }`.
  - `decodes u64 hex to decimal`: `value '119421565333810'`, `num 119421565333810`.
  - `decodes u256 above 2^53 exactly`: value `0x1` followed by 63 zeros keeps the exact decimal string; `num` is finite.
  - `decodes i32 json number`: `-5` gives `value '-5'`, `num -5`.
  - `decodes dec string`: `'3.5'` gives `value '3.5'`, `num 3.5`.
  - `decodes bool`: `true` gives `value 'true'`, `num 1`.
  - `lowercases addr, key, bytes32 and entity addresses`.
  - `creationFlags as number`: `creationFlags: 2` gives `creation_flags 2`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Check the bool and dec encodings against `node_modules/@arkiv-network/sdk/src/attr/values.ts` and `src/types/rpcSchema.ts`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(core): entity decoding`.

### Task 4: Key chunk queries and expression terms

**Files:**
- Create: `packages/core/src/query.ts`
- Test: `packages/core/test/query.test.ts`

**Interfaces:**
- Produces:
  - `keyChunkQueries(expression: string | null, keys: string[], chunkSize = 50): string[]` (null expression gives only the OR of key terms)
  - `ownerTerms(expression: string): { creators: string[]; owners: string[] }` (lowercased addresses from `$creator = addr(0x..)` and `$owner = addr(0x..)` terms; empty arrays when absent)
  - `hasCreatorTerm(expression: string): boolean`

- [ ] **Step 1: Write failing tests.** In these tests `0x01`, `0x02` stand for 32 byte keys (`'0x' + '01'.padStart(64, '0')`), because the SDK `key()` helper rejects shorter values; `0xab`, `0xAA`, `0xbb` stand for 20 byte addresses likewise.
  - `builds one chunk`: `keyChunkQueries('$creator = addr(0xab)', ['0x01','0x02'])` equals `['($creator = addr(0xab)) AND ($key = key(0x01) OR $key = key(0x02))']`.
  - `splits 120 keys into 50, 50, 20`.
  - `empty keys gives []`.
  - `null expression`: `keyChunkQueries(null, ['0x01'])` equals `['$key = key(0x01)']`.
  - `ownerTerms finds both`: `'$creator = addr(0xAA) AND ($owner = addr(0xbb) OR type = str(\'x\'))'` gives `{ creators: ['0xaa'], owners: ['0xbb'] }`.
  - `hasCreatorTerm false for 'type = str(\'x\')'`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Render key literals with the SDK `eq('$key', key(k))` and `or(...)` helpers from `@arkiv-network/sdk` so quoting matches the node. `ownerTerms` is a regex over the raw expression; it is a prefilter only, so false positives are fine and false negatives are not (document that in a comment).
- [ ] **Step 4:** Run. Expected: PASS. Export everything from `src/index.ts`.
- [ ] **Step 5:** Claude commits `feat(core): key chunk queries`.
