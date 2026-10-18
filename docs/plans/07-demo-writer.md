# Plan 07: Demo Writer

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `SPECS.md` §10
3. SDK source: `node_modules/@arkiv-network/sdk/src/actions/wallet/` (`createEntity`, `executeBatch`, `extendEntity`, `patchEntity`, `changeOwnership`) and `src/clients/`

**Goal:** A Bun script that writes synthetic support desk data through the normal SDK flow so the index visibly reacts: per type expiry, batch writes, lease extension, patches and ownership transfer.

**Architecture:** `plan.ts` decides the next action from a seeded random source and current local state (pure, unit tested). `writer.ts` maps each action to one SDK call. `main.ts` loops with a delay.

**Tech Stack:** Bun, `@arkiv-network/sdk` 0.8.1, viem (SDK peer), `bun test`.

**Spec:** `SPECS.md`

## Review Focus

1. Missing `DEMO_PRIVATE_KEY` exits with a clear message and never logs the key.
2. A failed transaction (insufficient funds, revert) logs and continues; the loop does not die.
3. Extending or patching a ticket that already expired on chain: treat as gone and drop it from local state.
4. Every entity carries `type` and `project = 'arkiv-sql-indexer-demo'` attributes so the index expression can filter on them in addition to `$creator`.
5. Synthetic data only: no real names, emails or personal data.

---

### Task 1: Action planner

**Files:**
- Create: `apps/demo-writer/package.json` (name `@asi/demo-writer`, deps `@arkiv-network/sdk` `0.8.1`, `viem` as required by the SDK), `apps/demo-writer/src/plan.ts`
- Test: `apps/demo-writer/test/plan.test.ts`

**Interfaces:**
- Produces:
  - `type Ticket = { key: string; status: 'open' | 'pending' | 'closed'; assignee: string | null }`
  - `type Action = { kind: 'open_ticket'; title: string; priority: number; comment: string } | { kind: 'comment'; ticket: string; text: string } | { kind: 'set_status'; ticket: string; status: Ticket['status'] } | { kind: 'assign'; ticket: string; agent: string } | { kind: 'heartbeat' }`
  - `nextAction(state: { tickets: Ticket[]; agents: string[] }, rand: () => number): Action` (with no tickets always `open_ticket`; otherwise weights: open 25, comment 35, set_status 15, assign 10, heartbeat 15; never assigns a ticket already assigned; never comments on closed tickets)
  - `EXPIRY_SECONDS = { ticket: 7 * 86400, comment: 86400, heartbeat: 600 }`
- [ ] **Step 1: Write failing tests:** empty state gives `open_ticket`; with a seeded generator, 1,000 actions over a fixed state show every kind; never `assign` an assigned ticket; never `comment` on a closed one; titles come from a fixed synthetic word list.
- [ ] **Step 2:** `bun test apps/demo-writer`. Expected: FAIL.
- [ ] **Step 3:** Implement with a small seeded PRNG (mulberry32).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Claude commits `feat(demo): action planner`.

### Task 2: SDK writer and loop

**Files:**
- Create: `apps/demo-writer/src/writer.ts`, `apps/demo-writer/src/main.ts`

**Interfaces:**
- Consumes: SDK wallet client from `createWalletClient` with `tiramisu` chain and `privateKeyToAccount(DEMO_PRIVATE_KEY)`.
- Produces: `perform(client, action: Action, state): Promise<void>` mapping:
  - `open_ticket`: one atomic batch creating the `ticket` (attributes `type='ticket'`, `title`, `status='open'`, `priority` as `u64`) and its first `comment` (`type='comment'`, `ticket` as `key` attribute holding the ticket key, payload = comment text). Ticket key comes from the batch result or `predictEntityKeys`.
  - `comment`: create `comment` with 1 day expiry, then `extendEntity` on the ticket by `EXPIRY_SECONDS.ticket` worth of time (lease renewed by activity).
  - `set_status`: `patchEntity` on the ticket with the new `status` (keep the other attributes).
  - `assign`: `changeOwnership` of the ticket to the agent address, and patch `assignee`.
  - `heartbeat`: create `heartbeat` with 10 minute expiry.
- [ ] **Step 1:** Implement following the SDK signatures in its source; expiry uses the SDK `ExpirationTime` helpers.
- [ ] **Step 2:** `main.ts` reads `DEMO_PRIVATE_KEY`, `DEMO_AGENT_ADDRESSES` (comma list), `DEMO_INTERVAL_MS` (default 8000), `DEMO_SEED`; logs each action with tx hash and entity key; catches and logs errors per action.
- [ ] **Step 3:** `bunx tsc --noEmit -p apps/demo-writer`. Expected: no errors.
- [ ] **Step 4:** **[Claude]** fund the demo wallet from the Tiramisu faucet, run for 3 minutes, confirm each action kind lands (query by `$creator`). Commit `feat(demo): sdk writer loop`.
