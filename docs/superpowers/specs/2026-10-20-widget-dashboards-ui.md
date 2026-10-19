# Widget dashboards: UI design

Date: 20 October 2026. Companion to `2026-10-20-widget-dashboards-design.md` (section 9). Choices the spec leaves open are marked (design call).

## 0. Shared building blocks

Tokens only from `app/theme.css`, no new colors. Buttons use `.btn`, `.btn-primary`, `.btn-quiet`, `.btn-run`. Tabs use `.tabs`/`.tab`/`.tab-n`. Counters use `.tiles`/`.tile`. Cards reuse `components/showcase/showcase.module.css` (`.card`, `.head`, `.body`, `.chart`, `.stat`, `.table`, `.foot`, `.action`) with `--lg/--md/--sm` spans.

New components in `components/widgets/` (visual props in brackets): `ChartIcon` (`type`, `size=16`; inline SVG, stroke 1.6, `currentColor`, like the WidgetCard icons), `ChartPicker`, `TimeLeft` (`expiresAt`, `head`), `ExtendButton` (`lifetimeDays`, `remainingDays`, `canExtend`), `SyncChip`, `SavedWidgetCard` (`name`, `payload | null`, `status: live | expired | loading`, `size`), `WidgetBrowseCard` (`variant: explorer | pick`, `selected`, `disabled`), `DashboardCard`, `LoginGate`, `ExtendDialog`, `AvatarMenu`, `ImportModal`, `AddToDashboardPicker`, `OrganizeRow`, `LayoutPreview`.

**Chips (exact copy).** Live widget: `quiet-chip` "6d 23h left". Under 24h: `.state .state-behind` (warn) "Expires in 3h" ("Expires in 40m" under an hour). Expired: `.state .state-stale` "Expired". Write pending: `.state .state-disk` (info) "Syncing". Imported: `quiet-chip` "by 0x77…01". Addresses always through `shortHex` and `AddressLink`.

**Chart types to existing components.** An adapter `toChartWidget(payload): Widget` maps the payload onto the existing `lib/views` Widget so `WidgetBody` renders it.

| Type | Label | Icon | Renders with |
| :--- | :--- | :--- | :--- |
| table | Table | 3 by 3 grid | `DataTable` |
| counter | Counter | "123" glyph | new `CounterBody`, reuses `.stat-value` and the `.stat` card class; label below in `.note` style |
| bar | Bar | three vertical bars | `ColumnChart` (kind `histogram`); stacked uses `StackedBarChart` |
| hbar | H bar | three horizontal bars | `HBarChart` (kind `bar`) |
| line | Line | polyline | new `line` branch in `QueryChart` (recharts `Line`, width 2, no fill) |
| area | Area | filled polyline | `AreaChart` |
| donut | Donut | ring with a gap | `DonutChart` |

`QueryChart` must gain 100% stacking (`stackOffset="expand"`), stacked Y columns, number format and series colors; props are the builder's (spec 10).

**ChartPicker row.** `role="radiogroup"` "Chart type": seven 32px segments, icon plus label; selected has `--accent-soft` background and `--accent` icon. Arrow keys move (roving tabindex). Phones scroll the row horizontally (design call).

**Expiry and Extend.** `ExtendButton` is `.btn-quiet` "Extend". Click opens a confirm dialog (owner decision, 20 October 2026): `role="dialog"`, `aria-modal`, max width 380px, focus trapped, Escape or "Cancel" closes and refocuses the button. Title "Extend “Top 10 creators”?", body "Adds 7 days (days actually added: the lifetime, clipped by the 90 day cap). New expiry: in 13d 23h. Our wallet pays, you pay nothing.", buttons "Cancel" and `.btn-primary` "Extend". Confirm shows "Extending…" in the dialog, then closes; the button shows "Extended ✓" for 3 seconds while `TimeLeft` updates optimistically. At the 90 day cap the button is disabled with title "Already at the 90 day maximum". Error: inside the dialog, `.error` "Couldn't extend. Try again." Hidden when the viewer may not extend and on expired widgets (Arkiv refuses). New component `ExtendDialog`.

**Write pending.** Every write shows its result optimistically, a `SyncChip` "Syncing" by the title, and an `aria-live` note "Saved to Arkiv. The index catches up in a few seconds." The chip clears when the row reaches local DuckDB (design call: no toast system).

**Loading.** Index not ready: existing copy "Loading the index into your browser…". Cards: fixed height `--card-2` skeleton. Query errors reuse `WidgetBody`'s `.error`.

## 1. Nav button and avatar menu

`NAV_ITEMS` gains "Widgets" (`/widgets`) after Playground. Right of `.top-sp`, before `ThemeToggle`: logged out, `.btn .btn-primary` "Build your dashboard" (under 420px "Build", design call); click opens Privy. Logged in it becomes `AvatarMenu`: a 34px round button (same size as `.theme-btn`) showing the provider glyph, `aria-haspopup="menu"`. Popover (`--card-2`, `--shadow-pop`): `shortHex(address)` and "via Google" (client only) in `--text-3`, then "My home" and "Log out". Arrow keys move; Escape closes and refocuses.

## 2. Privy login moment

Privy's modal handles providers. During the session step (nonce plus personal_sign) the triggering button reads "Confirming…". Failure: `.error` "Login didn't finish. Try again." After success the original action continues (open picker, save, go to `/me`). Logged out on a login only page (`/me`, `/d/<key>/edit`, `/widgets/new`) renders `LoginGate`: centred card, max width 420px, heading "Log in to build dashboards", body "Use Google, Discord, X or Telegram. You never pay gas or hold tokens, and nothing personal goes on chain.", button "Log in". A logged in non owner on `/d/<key>/edit` sees "Only the owner can organize this dashboard." with "View dashboard".

`/widgets/new` and `/widgets/<key>` editing require login (owner decision, 20 October 2026): logged out, `/widgets/new` renders `LoginGate`. `/widgets/<key>` stays public read only.

## 3. Home `/me` (layout A)

Single column, `.wrap`. Header: h1 "My home", `quiet-chip` with short address.

1. **My dashboards.** Section header with `.btn-primary` "+ New dashboard". Grid of `DashboardCard` (span 4, 6 under 1100px, 12 under 760px): title (15px, 600), meta "4 widgets · edited 2h ago" in `--text-2`. Whole card links to `/d/<key>`. "+ New dashboard" opens a dialog ("Dashboard title", "Create dashboard"), then goes to `/d/<key>/edit` (design call). Empty: "No dashboards yet. Create one, then add widgets to it." plus the same button.
2. **My widgets.** Compact rows in a card list (name, ChartIcon, `TimeLeft`, `ExtendButton`, "Open"), soonest expiry first; two columns on desktop, one on phone. Header button `.btn` "+ New widget". Empty: "No widgets yet. Write a query and save it as your first widget."
3. **My activity.** `.tiles` with four tiles: "Live widgets", "Live dashboards", "Placements" (tooltip "Times your widgets appear on any dashboard"), "Active days". Below, two columns (stacked on phone): "Expiring soon" (entities under 24h, warn chips, Extend inline) and "Recent" (entity name, `.pill-created` or `.pill-patched`, relative time, entity link). No tx hashes. Footnote in `--text-3`: "Counts cover live entities only." Empty list copy: "Nothing expiring soon." and "No activity yet."

## 4. Widget editor `/widgets/new` and `/widgets/<key>` (variant A, stacked)

Sticky header bar (`--card`, bottom border): "← My home", name input (placeholder "Untitled widget", 18px), "Lives for" segment "1 day / 7 days / 30 days / 90 days" (default 7, design call), "Save to Arkiv" `.btn-primary`. Phone: name on row one, lifetime and Save on row two.

Below, in order: SQL editor card reusing `useSqlEditor` and the playground editor styling, `.btn-primary` "▶ Run" with the `Ctrl`/`⌘ + Enter` hint; results card with meta line (`RunBadge`, row count, each column as `TypeTag` "creator text") and `DataTable` capped at 240px; `ChartPicker`; then a two column area: preview `.card` (span 7) and settings panel (span 5); stacked on phone, preview first. Settings: "Data" section (selects for "X / label", "Y / values" plus "+ Add column", "Group by", segments "Stacking: Off / Stack / 100%", "Sort: Query / X / Y desc"); collapsible "Format" (`<details>`, closed). Counter swaps Data for its seven fields. Fields that don't apply to the chart type are hidden, not disabled. On create only: "Add to dashboard" select ("None" plus the user's dashboards) and size segment "XS / SM / MD / XL" shown once a dashboard is picked.

Before the first Run the preview reads "Run the query to see a preview." Save stays disabled until a run succeeds and a name exists; its title says "Give your widget a name" or "Run the query first".

**Save to Arkiv feedback.** "Saving…" (disabled), then route to `/widgets/<key>` with the Syncing chip and live note. Error keeps the draft: "Couldn't save to Arkiv. Your draft is kept. Try again." Rate limited: "Too many saves. Try again in a minute."

**Saved page.** Under the header a meta line: "by 0x4a…c2 · `TimeLeft` · `ExtendButton` · tx 0x9f…a1 · on 3 dashboards". Owner keeps the editor; Save becomes "Save changes", enabled once something changes. Non owners get plain text name, full width preview, read only SQL and results below, no settings, and header buttons "+ Add to my dashboard" and "Open in playground" (`playgroundHref`). Expired or missing key: "This widget has expired. Its query is no longer on Arkiv." with "Browse widgets".

## 5. Widget explorer `/widgets`

Header: h1 "Widgets", `quiet-chip` "214 live", `.btn-primary` "+ New widget". Controls row (wraps on phone): search input "Search by name or creator address", type filter chips ("All" plus seven with ChartIcon, horizontally scrolling on phone), sort select "Newest / Most used / Expiring soon", checkbox "Mine only" when logged in.

Grid of `WidgetBrowseCard` (span 4, 6 under 1100px, 12 under 760px). Card: preview area 160px (charts without axes text at this size, counters show the value), name, meta "ChartIcon H bar · by 0x4a…c2 · on 12 dashboards", `TimeLeft`; footer actions `.action` "Open" and `.action .primary` "+ Add to dashboard". Offscreen previews show a faded 32px ChartIcon; loading shows a skeleton; errors show muted "Preview unavailable". "Load more" button fetches the next 12 (design call, not infinite scroll).

Empty: no widgets at all: "No widgets yet. Be the first to build one." plus "+ New widget". No match: "No widgets match these filters." plus `.btn-quiet` "Clear filters".

## 6. Dashboard view `/d/<key>`

Header: h1 title, meta "by 0x4a…c2 · 5 widgets", buttons: owner gets `.btn` "Organize" and `.btn-primary` "+ Add widget" (opens organize with the import modal open, design call); everyone gets `.btn-quiet` "Copy link" ("✓ Link copied", same as playground).

Grid: showcase `.grid` (12 columns, 24px gap). `SavedWidgetCard` spans: xs 3, sm 4, md 6, xl 12; under 1100px xs and sm 6, md and xl 12 (design call); under 760px all 12. Card footer: `RunBadge`, `TimeLeft`, SQL toggle, "Open" to `/widgets/<key>`. Expired slot: same card size, stored name as title, body centred `.state-stale` "Expired" plus "This widget is no longer on Arkiv, so nothing runs." in `--text-3`; owners also see "Remove it on Organize."

Empty: owner "This dashboard is empty." with "+ Add widget"; others "This dashboard has no widgets yet." Not found: "Dashboard not found. It may have expired or the link is wrong." with "Browse widgets".

## 7. Organize `/d/<key>/edit`

Header: title as inline editable input, "Unsaved changes" in `--warn` when dirty, buttons "+ Import widget", "+ New widget" (to `/widgets/new?dashboard=<key>`, confirming "Leave without saving your changes?" when dirty), `.btn-primary` "Done". Done: "Saving…", then back to `/d/<key>` with Syncing. No changes: Done just navigates. `beforeunload` guard when dirty (design call).

Body: list (span 5) and `LayoutPreview` (span 7). Phone: tabs "Order" and "Preview". `LayoutPreview` draws the same 12 column grid with schematic blocks (ChartIcon, name, size label), no queries run (design call). `OrganizeRow` (52px): drag handle (⋮⋮ button, `aria-label="Reorder Top 10 creators"`), ChartIcon and name, imported chip, size `<select>` "XS SM MD XL", `TimeLeft` plus `ExtendButton`, remove ✕ (`aria-label="Remove Top 10 creators"`, no confirm since Done is the commit). Expired rows at 50% opacity with only remove active. Empty: "No widgets yet. Import one or create a new widget."

**Drag and drop.** `DndContext` with `closestCenter`, `PointerSensor` (activation distance 4px), `TouchSensor` (delay 200ms, tolerance 5px), `KeyboardSensor` with `sortableKeyboardCoordinates`; `SortableContext` with `verticalListSortingStrategy`; listeners only on the handle. The dragged row lifts with `--shadow-pop` and `--accent` border; a 2px `--accent` line marks the drop position. Keyboard: focus handle, Space picks up, arrows move, Space drops, Escape cancels. Announcements: "Picked up Top 10 creators, position 2 of 5.", "Moved to position 3 of 5.", "Dropped at position 3 of 5.", "Reorder cancelled."

## 8. Import modal

`role="dialog"`, `aria-modal`, max width 880px, full screen sheet on phone, focus trapped, Escape closes. Title: Import widgets into “Top creators”, close ✕. Tabs "My widgets" and "All widgets" with `.tab-n` counts, search, type chips. Grid of `WidgetBrowseCard variant="pick"` (3 columns, 2 under 900px, 1 on phone, preview 120px). The whole card toggles with `aria-pressed`; selected gets `--accent` border and a check in the corner. Already placed: dimmed, label "Already on this dashboard", not focusable as a toggle. Sticky footer: "2 selected" and `.btn-primary` "Add 2 widgets" ("Add 1 widget"; disabled "Add widgets" at zero), plus "Cancel". New rows append to the draft and flash `--accent-soft` once. Empty My widgets: "You have no widgets yet." with "+ New widget".

## 9. Add to dashboard picker

From a widget page or explorer card. Desktop: popover 300px wide under the button; phone: bottom sheet. Title "Add to dashboard". Rows: dashboard title and "4 widgets"; already containing it: disabled "Already added". Click writes immediately: row shows "Adding…", then "Added ✓" with a "View" link; closes after 2 seconds. Last row "+ New dashboard" expands an inline title input with "Create and add". No dashboards: only that row. Logged out: Privy first, then the picker opens.

## Design calls

1. Extend confirm is a dialog (owner decision); inline Syncing chip, no toast system.
2. `/widgets/new` requires login (owner decision).
3. Default lifetime 7 days; "Build" label under 420px; provider glyph avatar.
4. New dashboard dialog leads straight to organize; "+ Add widget" opens organize with the import modal (owner approved).
5. Mid width spans: xs and sm 6, md and xl 12.
6. Schematic layout preview on organize; Order and Preview tabs on phone.
7. "Load more" in pages of 12 for explorer and import.
8. Non owner widget page: preview first, read only SQL, no settings.
9. No confirm on organize remove; `beforeunload` guard when dirty.
10. Chart labels and icons as listed; Line is a new `QueryChart` branch.
