# Plan 08: Docker Compose, Deployment and Submission Docs

> For agentic workers: implement task by task. Steps use checkbox syntax.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `SPECS.md` §14 (deployment), §16 (deliverables)
3. `/Volumes/intellica/arkiv/projects-ideas/filtered-projects/CONTEXT.md` gates section (Claude only; codex reads the gate list below)

**Goal:** One `docker compose up -d --build` runs indexer and web (demo writer behind a profile), plus every document the hackathon gates require.

**Architecture:** Two Dockerfiles built from the repository root (Bun workspaces need the root lockfile). Indexer is internal (`expose`), web is public (`ports`).

**Tech Stack:** Docker Compose v2, `oven/bun:1.3` images, Next.js standalone output.

**Spec:** `SPECS.md`

Gates the docs must satisfy: public deployment; reproducible setup; MIT licence; `arkiv/schema.md` (entity types, attributes, expiry per type, the queries the app runs); `arkiv/friction.md`; wallet addresses in README; demo video under 3 minutes; built 9 to 18 October 2026.

## Review Focus

1. `TIRAMISU_API_KEY` reaches only the indexer service; the web image and client bundle never contain it (grep the built `.next` output).
2. Indexer data survives `docker compose down` and `up` (named volume) and does not backfill again.
3. Web starts only after the indexer health check passes; if the indexer restarts, the proxy returns 502 then recovers.
4. `docker compose up` without `--profile demo` does not start the writer.
5. Docs use no dashes as punctuation.

---

### Task 1: Dockerfiles and compose

**Files:**
- Create: `apps/indexer/Dockerfile`, `apps/web/Dockerfile`, `apps/demo-writer/Dockerfile`, `docker-compose.yml`, `.env.example`, `.dockerignore`

- [ ] **Step 1:** Indexer image: `oven/bun:1.3`, copy root manifests and lockfile, `bun install --frozen-lockfile --production`, copy `packages/core` and `apps/indexer`, `CMD ["bun", "apps/indexer/src/main.ts"]`, `ENV DATA_DIR=/data`.
- [ ] **Step 2:** Web image: build stage with Bun runs `bun install --frozen-lockfile` and `bun run --cwd apps/web build`; runtime stage `node:22-slim` copies `.next/standalone`, `.next/static`, `public`; `CMD ["node", "apps/web/server.js"]` (path per standalone output layout), `PORT=3000`, `HOSTNAME=0.0.0.0`.
- [ ] **Step 3:** Compose per SPECS §14: services `indexer` (`expose: ["8080"]`, volume `index-data:/data`, `env_file: .env`, healthcheck `bun -e "fetch('http://localhost:8080/health').then(r=>process.exit(r.ok?0:1))"`), `web` (`ports: ["3000:3000"]`, `environment: INDEXER_URL=http://indexer:8080, NEXT_PUBLIC_TIRAMISU_RPC_URL`, `depends_on: indexer: condition: service_healthy`), `demo-writer` (`profiles: ["demo"]`). All `restart: unless-stopped`.
- [ ] **Step 4:** `.env.example` lists `TIRAMISU_API_KEY=`, `INDEX_EXPRESSION=`, `DEMO_PRIVATE_KEY=`, `DEMO_AGENT_ADDRESSES=`, `NEXT_PUBLIC_TIRAMISU_RPC_URL=https://rpc.tiramisu.db-chain.testnet.arkiv.network`.
- [ ] **Step 5:** **[Claude]** `docker compose up -d --build`; `curl -s localhost:3000/data/manifest.json`; Range request through port 3000 returns 206; `grep -r "$TIRAMISU_API_KEY" apps/web/.next` finds nothing; restart cycle keeps the store. Commit `feat: docker compose deployment`.

### Task 2: Submission docs

**Files:**
- Create: `README.md`, `LICENSE` (MIT, current year, author from git config), `arkiv/schema.md`, `arkiv/friction.md`, `CHANGELOG.md`, `DEVELOPER.md`

- [ ] **Step 1:** `README.md`: one paragraph pitch, live demo URL, how expiry is enforced (SPECS §13 three layers), quick start (`cp .env.example .env`, fill keys, `docker compose up -d --build`, optional `--profile demo`), indexed expression of the demo, demo wallet and agent addresses, tracks (Open Source, Security), architecture diagram from SPECS §6, roadmap (Parquet expiry buckets, DataFusion, DuckLake, server side SQL).
- [ ] **Step 2:** `arkiv/schema.md`: entity types `ticket`, `comment`, `heartbeat` with every attribute and its type, expiry per type, which operations touch them, and the exact Arkiv queries the indexer runs (backfill query, key chunk query, payload and verify queries).
- [ ] **Step 3:** `arkiv/friction.md`: one section per issue with expected, actual, versions, steps to reproduce, suggested fix. Start with the verified ones from SPECS §4: anonymous budget exhausted by one query and 429 body not a JSON-RPC envelope; `query is too long` limit undocumented (between about 4,100 and 8,200 characters); cost is flat per call so the cheapest client pattern is undocumented; monthly quota size not exposed in headers. Claude adds any issue found during the build.
- [ ] **Step 4:** `CHANGELOG.md` (0.1.0 entry), `DEVELOPER.md` (workspace layout, test commands, data root layout, how a batch sync works).
- [ ] **Step 5:** `grep -nE " — | – | - " README.md arkiv/*.md DEVELOPER.md CHANGELOG.md` shows no dash punctuation (list bullets and code excluded). Claude commits `docs: submission docs`.

### Task 3: Public deployment [Claude]

- [ ] **Step 1:** Deploy compose on the chosen host, put TLS in front of port 3000, set the index expression to the demo wallet (and optionally the hackathon wallets), start `--profile demo`.
- [ ] **Step 2:** Open the public URL in Chrome, confirm tiles update and a write from the demo writer appears within about 15 seconds.
- [ ] **Step 3:** Record the demo video (under 3 minutes): dashboard, a JOIN and GROUP BY that `arkiv_query` cannot do, a heartbeat expiring out of the results, verify button, `$creator` filter badge.
