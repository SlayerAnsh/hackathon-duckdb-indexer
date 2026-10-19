# Drop the demo writer

Required reading: `CONTEXT.md` in this directory, the spec, `04-explorer-home-docs.md` Task 4 (docs it wrote).

Owner decision (20 October 2026): the synthetic support desk demo (`apps/demo-writer`, `DEMO_PRIVATE_KEY`, `DEMO_AGENT_ADDRESSES`, ticket, comment and heartbeat entities) is removed. The app's only wallet is `DASHBOARD_PRIVATE_KEY`, and the live Arkiv data the app showcases is its own widget, dashboard and link entities. The indexer code does not change. Production keeps indexing every entity.

## Global Constraints

Same as `CONTEXT.md` section 2. Docs prose uses no dashes as punctuation. Do not edit `arkiv/friction.md` beyond removing statements that would now be false about the running system (it is a historical friction log). Do not touch `bun.lock` or run `bun install`; the coordinator regenerates the lockfile.

---

### Task 1: Remove the demo writer and point every demo surface at widget data

**Files:**
- Delete: `apps/demo-writer/` (whole directory).
- Modify: root `package.json` (workspaces, scripts that mention the demo writer), `docker-compose.yml`, `docker-compose.dokploy.yml` (remove the demo service and profile, `DEMO_*` env), `.env.example` (remove `DEMO_PRIVATE_KEY`, `DEMO_AGENT_ADDRESSES`), `apps/web/lib/views.ts` (`DEFAULT_SQL`), `apps/web/components/playground/snippets.ts`, `apps/web/components/about/content.tsx`, `apps/web/components/about/ExpiryFigure.tsx`, `apps/web/app/about/page.tsx` if it carries demo copy, `README.md`, `SPECS.md`, `DEVELOPER.md`, `CHANGELOG.md`, `arkiv/schema.md`, `test/deployment.test.ts`, any web test that asserts demo copy or the old default SQL.
- Check with `git grep -n -i "demo-writer\|demo writer\|DEMO_\|heartbeat\|ticket"` after the change; remaining hits must be only in `arkiv/friction.md`, `CHANGELOG.md` history lines, `docs/superpowers/**`, or generic uses unrelated to the demo.

**Requirements:**
- `DEFAULT_SQL` becomes a query over the dashboard entities that works with the creator scoped views pattern from `lib/dash/sql.ts`, but written as plain SQL a visitor can read: most placed widgets. It joins widget entities (`type = 'widget'`, `project = 'arkiv-sql-indexer-dash'`) to link entities by the link `widget` attribute and returns widget key, name, chart type, number of dashboards, and `expires_at`, ordered by placements descending, limit 20. It must also return rows that make sense when there are zero links (LEFT JOIN, `coalesce(..., 0)`). Keep the playground header copy that explains the query accurate.
- The ticket snippet in `snippets.ts` is replaced by one or two widget snippets (for example "Widgets by chart type", "Dashboards by owner with widget counts"). Keep at least one existing generic snippet over all entities.
- About page and `ExpiryFigure`: describe widgets, dashboards and links as the live entities (per widget lifetimes of 1, 7, 30 or 90 days, Extend, link lifetime following the dashboard) instead of tickets, comments and heartbeats. Keep the existing structure and components; change copy and figure labels only.
- `README.md`: remove the demo writer setup, the demo profile, `DEMO_*` env rows, and the "Open tickets with most discussion" walkthrough; the `INDEX_EXPRESSION` example becomes the dashboard wallet scope `'$creator = addr(<dashboard wallet address>)'` with a note that the address is shown by `GET /api/dash/config`. Security section: the creator boundary now refers to the dashboard wallet.
- `arkiv/schema.md`: remove the ticket, comment and heartbeat sections and the demo expression; keep the RPC and SQL sections; widget, dashboard and link (added by plan 04) are the documented entity types.
- `SPECS.md`: goal 7 (demo writer) is marked removed on 20 October 2026 with one sentence why; remove other statements that describe the demo writer as running.
- `CHANGELOG.md`: one entry "Removed the demo writer; the dashboard wallet is the only writer" style line under the current unreleased section.
- `test/deployment.test.ts`: drop assertions about the demo service or `DEMO_*`; add an assertion that no compose file or `.env.example` contains `DEMO_PRIVATE_KEY` and that `apps/demo-writer` does not exist.

- [ ] **Step 1: Update the failing tests first** (`test/deployment.test.ts`, and any web test pinning the old default SQL or about copy to the new content).
- [ ] **Step 2: Run** `bun test ./test/deployment.test.ts ./apps/web/test`. Expected: FAIL on the new assertions.
- [ ] **Step 3: Implement** the deletions and replacements above.
- [ ] **Step 4: Run** `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: all pass, clean.
- [ ] **Step 5: Commit**

```bash
git commit -m "chore: drop the demo writer; the dashboard wallet is the only writer and widgets are the live demo data"
```
