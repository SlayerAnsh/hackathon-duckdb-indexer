# Dashboard cover widget (starred widget)

Required reading: `CONTEXT.md` in this directory (sections 2 to 8 and 12), `12-entity-query-cache.md` (this plan uses its hooks and must run after it), then `lib/dash/server/operations.ts` (organize batch, `titlePatches`), `lib/dash/schema.ts`, `lib/dash/entities.ts`, `lib/dash/sql.ts` (`dashCte`, `dashboardListSql`, `toDashboardItems`), `components/explore/DashboardBrowseCard.tsx`, and the organize edit mode components (`components/widgets/OrganizeBoard.tsx` and the tile tools it renders).

Owner decision (20 October 2026): the owner of a dashboard can star exactly one of its widgets. The starred widget becomes the dashboard's cover: dashboard cards (Explore, landing Featured dashboards, /me) show that widget's live chart as the preview instead of the chart type icons. With no star, the cards keep the icon preview (at most four icons).

## Global Constraints

Same as `CONTEXT.md` section 2. Dashboards and links stay owned by the app wallet and are written by the existing organize endpoint (the user does not sign dashboard writes). Read the installed `@arkiv-network/sdk` source for patch semantics before changing attributes: check whether a patch's `set` (or the equivalent field) replaces the whole attribute list or merges, and keep every existing attribute (`type`, `project`, `user`, `login`, `title`, `slug` where present) intact.

## Review Focus

- Removing the starred widget from the dashboard (organize remove, widget deleted or expired) leaves no broken cover: cards fall back to icons and the next organize save clears the attribute.
- A cover key that is not a live widget linked to that dashboard (stale, tampered, or another creator's entity) is ignored by readers.
- A cover widget whose query fails or returns zero rows shows a compact preview state, never a broken card.
- Many cards with covers on Explore do not run all their queries at once off screen: render the live chart only when the card is near the viewport (reuse the existing visibility logic in `WidgetBrowseCard` if present), and use the entity cache for payloads.
- Featured dashboards seeded by the app (`lib/dash/official-defs.ts`) can declare a cover too.

---

### Task 1: Store, edit and render the dashboard cover

**Files:**
- Modify: `apps/web/lib/dash/schema.ts` (organize request: optional `cover: string | null`, an entity key or null), `apps/web/lib/dash/server/operations.ts` (organize plan writes the `cover` attribute on the dashboard entity, `key` typed, or removes it when null or when the starred widget is not in the final layout), the organize API route and its request validation, `apps/web/lib/dash/entities.ts` (`DashboardEntity` gains `cover: string | null`, valid only when it is a 32 byte entity key), `apps/web/lib/dash/sql.ts` (`dashboardListSql` and `toDashboardItems` return `cover` from the attribute, but only when a live link on that dashboard points to that widget and the widget row exists; append it as the last column), `apps/web/lib/dash/official-defs.ts` and `lib/dash/server/official.ts` (optional `cover` index per definition; set `network-overview` to its "Creations per hour" widget, `expiry-watch` to "Expiry horizon", `creators` to "Top 10 creators", `attributes` to "Top status values", `activity` to "Running count of creations"; existing seeded dashboards get it on the next keepalive or a one time `--set-covers` flag in `seed-cli.ts`, dry run aware), the organize edit mode tile tools (a star toggle), `apps/web/components/explore/DashboardBrowseCard.tsx` (cover preview), and the cards used on the landing and /me if they are separate components.
- Test: the existing organize operations tests, `test/dash-explore.test.tsx`, the official seed tests, a new `test/dashboard-cover.test.tsx`.

**Interfaces:**
- Consumes: `useWidgetEntity` or `useWidgetEntities` from `lib/dash/entity-cache.ts` (plan 12), `WidgetPreview` and its query hook as used by `WidgetBrowseCard`.
- Produces: `DashboardListItem.cover: string | null`; organize state gains `cover: string | null` with reducer actions `{ type: 'star', key: string }` (sets the cover, or clears it when the same key is starred again) and removal of the starred item clearing the cover; `organizePlan` output includes the cover change only when it differs from the saved value (a cover change alone is a valid dirty state and saves with one dashboard patch).

**Requirements:**
- Edit mode: every tile shows a star toggle in its header tools (the tile tools layout from the current organize design; icon button with `has-tip`, `data-tip` "Use as cover" or "Cover widget", `aria-pressed`). Exactly one tile can be starred; the starred tile shows a filled star in the accent color in view and edit mode for the owner. View mode for visitors shows no star.
- Card preview with a cover: the preview area renders the cover widget's live chart through the same preview component and query path `WidgetBrowseCard` uses, compact (axes hidden as there), with a small "Cover" label not needed; keep the card height identical to the icon variant. While the payload or query loads, show the skeleton; on error or zero rows, fall back to the icon preview.
- Readers validate: `cover` must be one of the dashboard's linked widget keys (SQL side in `dashboardListSql`, and `asDashboard` keeps the raw value but the card only trusts the SQL validated value).
- Docs: add the `cover` attribute to `arkiv/schema.md` (dashboard entity) and one line to `SPECS.md` and `CHANGELOG.md` (Unreleased). No dashes as punctuation in docs.

- [ ] **Step 1: Write the failing tests**
  - organize state: starring A sets cover A; starring B moves it to B; starring B again clears it; removing B while starred clears it; a cover only change makes the state dirty.
  - `organizePlan` / operations: a cover change produces one dashboard patch whose attributes still contain `type`, `project`, `user`, `login`, `title` (and `slug` when present) plus `cover` as a key attribute; clearing removes `cover` and keeps the rest; a cover key not in the final layout is rejected or dropped (pick one, document it in the test name).
  - `dashboardListSql` against the native DuckDB test helper (`test/dash-duckdb`): a dashboard with a `cover` attribute that matches a linked live widget returns that key; a cover pointing to an unlinked widget returns null; no attribute returns null.
  - `DashboardBrowseCard` static render with `cover` set and a resolved preview contains the preview container and not the icon grid; with `cover: null` contains the icon grid with at most four icons.
  - official defs: every `cover` index points to an existing widget of that definition.

- [ ] **Step 2: Run** the touched test files. Expected: FAIL.

- [ ] **Step 3: Implement** as described.

- [ ] **Step 4: Run** `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: all pass, clean.

- [ ] **Step 5: Commit** (coordinator)

```bash
git commit -m "feat(web): star one widget as the dashboard cover and show its live chart on dashboard cards"
```
