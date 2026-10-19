# Lists and organize review fixes

Required reading: `CONTEXT.md` in this directory, then `03-dashboards.md` and `04-explorer-home-docs.md` for the modules touched here.

Fixes verified review findings against plans 3 and 4. One task, one commit.

## Global Constraints

Same as `CONTEXT.md` section 2. Interaction logic stays in pure functions tested directly.

---

### Task 1: No loading flash on index ticks, visible RPC errors, debounced import search, correct Extend and title handling

**Files:**
- Modify: `apps/web/components/widgets/WidgetBrowseCard.tsx`, `apps/web/components/widgets/ExplorerGrid.tsx`, `apps/web/components/widgets/ImportModal.tsx`, `apps/web/components/widgets/HomePage.tsx`, `apps/web/lib/dash/use-widget-list.ts`, `apps/web/components/widgets/OrganizeRow.tsx`, `apps/web/components/widgets/OrganizeBoard.tsx`, `apps/web/lib/dash/organize-state.ts` (paths as they exist; follow the imports if a name moved).
- Test: the existing tests for these modules (`apps/web/test/dash-browse.test.tsx`, the organize and home tests).

Why (verified findings):
1. `lib/indexdb.ts:160` notifies on every 2 second poll, `use-index.ts` bumps `version`, `use-query.ts:25` keeps previous data but sets `loading: true`, so components that render on bare `.loading` flash the skeleton or "Loading the index into your browser…" every tick (`WidgetBrowseCard.tsx:30`, `ExplorerGrid.tsx:39,50`, `ImportModal.tsx:22`, `HomePage.tsx:94`). Repo precedent: `AddToDashboardPicker.tsx:82` uses `loading && !data`.
2. `use-widget-list.ts` sets `payloadError` that no component renders; `HomePage.tsx:76` swallows payload errors and hides Extend with no retry.
3. `ImportModal.tsx:90` searches on every keystroke and remounts the list (key includes the search), sending one `arkiv_query` per keystroke. The explorer debounces 250 ms.
4. `OrganizeRow.tsx:20` always passes `canExtend`; an imported widget owned by someone else has no link until Done, so the server rejects the extend.
5. `OrganizeBoard.tsx` registers `PointerSensor` and `TouchSensor`; in `@dnd-kit/core` 6.3.1 the pointer sensor activates first (`core.esm.js:3183-3199`), so the touch delay is dead config.
6. The organize title input has no `maxLength`/`required`, and `isDirty` compares the untrimmed title, so a trailing space sends a no op title patch transaction.

**Interfaces:**
- Produces: `showLoading(q: { loading: boolean; data: unknown }): boolean` in a shared small module (for example `apps/web/lib/dash/loading.ts`), true only when `loading` and `data` is null or undefined. Every component listed in finding 1 uses it instead of bare `.loading`.
- Produces: `canExtendRow(row: { link: unknown | null; widgetUser: string; expired: boolean }, caller: string | null): boolean` in `organize-state.ts`. True when not expired and (`widgetUser === caller` or `link !== null`).
- Changes: `isDirty` compares `title.trim()` with the saved title.

- [ ] **Step 1: Write the failing tests**
- `showLoading({ loading: true, data: null })` true; `showLoading({ loading: true, data: [] })` false; `showLoading({ loading: false, data: null })` false.
- Static render of `WidgetBrowseCard` with a payload, `preview = { loading: true, data: <rows> }` shows the chart, not the skeleton.
- `ImportModal` search reducer or helper: the list key (or the value passed to the list) changes only after a 250 ms debounce. Test the debounce through a pure helper (for example `nextSearchKey(current, typed, elapsedMs)`) or by asserting the modal uses the same `useDebounced` hook the explorer uses, extracted to a shared module and unit tested with fake timers from `bun:test` (`jest.useFakeTimers` is not available; use an injected scheduler).
- When `fetchWidgets` rejects with an `RpcError` carrying `retryAfter`, the explorer and import modal render the same rate limit copy the dashboard view uses (`rpcMessage` from `use-dashboard.ts` or its source module) above the grid, and `HomePage` renders it in the widgets section instead of silently hiding Extend.
- `canExtendRow` cases: own widget without link true; other user's widget with link true; other user's widget without link false; expired false.
- `isDirty` is false when the only change is trailing whitespace in the title. The title input markup contains `maxLength="80"` and `required`.

- [ ] **Step 2: Run** the touched test files. Expected: FAIL.

- [ ] **Step 3: Implement**
- Use `showLoading` everywhere listed. Keep `aria-busy` while refreshing if a component already sets it.
- Render `payloadError` through `rpcMessage`. In `HomePage`, keep the last good payloads on refetch failure and show the message; retry when the user clicks a "Try again" `.btn-quiet` (copy: "Try again").
- Debounce the modal search 250 ms with the shared hook; do not key `LivePage` on the raw typed value.
- `OrganizeRow` gets `canExtend={canExtendRow(row, auth.address)}`.
- `OrganizeBoard` sensors become `MouseSensor` (distance 4), `TouchSensor` (delay 200, tolerance 5) and `KeyboardSensor` with `sortableKeyboardCoordinates`, all from the installed `@dnd-kit/core` and `@dnd-kit/sortable`.
- Title input gets `maxLength={80}` and `required`; Done is disabled while the trimmed title is empty.

- [ ] **Step 4: Run** `bun test ./apps/web/test`, `bun test ./test/deployment.test.ts`, and `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .`. Expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(web): no loading flash on index ticks, visible RPC errors, debounced import search, correct extend and title checks"
```
