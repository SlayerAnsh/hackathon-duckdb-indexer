# Widget dashboards: UI design

Date: 20 October 2026. Companion to `2026-10-20-widget-dashboards-design.md` (section 9). Choices the spec leaves open are marked (design call).

Section 11 (user owned widgets, owner approved 20 October 2026) supersedes the Extend, owner and LoginGate rules of sections 0 to 4 and 7. Section 10 (live dashboards redesign, owner approved 20 October 2026) supersedes the visual parts of sections 0, 1, 5 and 6 where they conflict. Each superseded paragraph carries a note pointing to the replacing subsection.

## 0. Shared building blocks

Superseded by §10.1 and §10.2 (owner decision, 20 October 2026): the theme is the v5 console theme with five new tokens. Tokens only from `app/theme.css`, no new colors. Buttons use `.btn`, `.btn-primary`, `.btn-quiet`, `.btn-run`. Tabs use `.tabs`/`.tab`/`.tab-n`. Counters use `.tiles`/`.tile`. Cards reuse `components/showcase/showcase.module.css` (`.card`, `.head`, `.body`, `.chart`, `.stat`, `.table`, `.foot`, `.action`) with `--lg/--md/--sm` spans.

New components in `components/widgets/` (visual props in brackets): `ChartIcon` (`type`, `size=16`; inline SVG, stroke 1.6, `currentColor`, like the WidgetCard icons), `ChartPicker`, `TimeLeft` (`expiresAt`, `head`), `ExtendButton` (`lifetimeDays`, `remainingDays`, `canExtend`), `SyncChip`, `SavedWidgetCard` (`name`, `payload | null`, `status: live | expired | loading`, `size`), `WidgetBrowseCard` (`variant: explorer | pick`, `selected`, `disabled`), `DashboardCard`, `LoginGate`, `ExtendDialog`, `AvatarMenu`, `ImportModal`, `AddToDashboardPicker`, `OrganizeRow`, `LayoutPreview`.

**Chips (exact copy).** Live widget: `quiet-chip` "6d 23h left". Under 24h: `.state .state-behind` (warn) "Expires in 3h" ("Expires in 40m" under an hour). Expired: `.state .state-stale` "Expired". Write pending: `.state .state-disk` (info) "Syncing". Imported: `quiet-chip` "by 0x77…01". Addresses always through `shortHex` and `AddressLink`.

**Chart types to existing components.** Owner decision, 20 October 2026: two more types, `stacked-bar` and `histogram`, see §10.9. An adapter `toChartWidget(payload): Widget` maps the payload onto the existing `lib/views` Widget so `WidgetBody` renders it.

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

Superseded by §10.3 (owner decision, 20 October 2026): the nav is option A with Home, Explore, Playground and About; `/widgets` is a tab of `/explore`. `NAV_ITEMS` gains "Widgets" (`/widgets`) after Playground. Right of `.top-sp`, before `ThemeToggle`: logged out, `.btn .btn-primary` "Build your dashboard" (under 420px "Build", design call); click opens Privy. Logged in it becomes `AvatarMenu`: a 34px round button (same size as `.theme-btn`) showing the provider glyph, `aria-haspopup="menu"`. Popover (`--card-2`, `--shadow-pop`): `shortHex(address)` and "via Google" (client only) in `--text-3`, then "My home" and "Log out". Arrow keys move; Escape closes and refocuses.

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

Superseded in part by §10.6 (owner decision, 20 October 2026): this content becomes the Widgets tab of `/explore`; the h1 is "Explore" and `/widgets` redirects to `/explore?tab=widgets`. Header: h1 "Widgets", `quiet-chip` "214 live", `.btn-primary` "+ New widget". Controls row (wraps on phone): search input "Search by name or creator address", type filter chips ("All" plus seven with ChartIcon, horizontally scrolling on phone), sort select "Newest / Most used / Expiring soon", checkbox "Mine only" when logged in.

Grid of `WidgetBrowseCard` (span 4, 6 under 1100px, 12 under 760px). Card: preview area 160px (charts without axes text at this size, counters show the value), name, meta "ChartIcon H bar · by 0x4a…c2 · on 12 dashboards", `TimeLeft`; footer actions `.action` "Open" and `.action .primary` "+ Add to dashboard". Offscreen previews show a faded 32px ChartIcon; loading shows a skeleton; errors show muted "Preview unavailable". "Load more" button fetches the next 12 (design call, not infinite scroll).

Empty: no widgets at all: "No widgets yet. Be the first to build one." plus "+ New widget". No match: "No widgets match these filters." plus `.btn-quiet` "Clear filters".

## 6. Dashboard view `/d/<key>`

Superseded by §10.7 (owner decision, 20 October 2026): the view reads like a statistics report with icon actions and a share menu. Header: h1 title, meta "by 0x4a…c2 · 5 widgets", buttons: owner gets `.btn` "Organize" and `.btn-primary` "+ Add widget" (opens organize with the import modal open, design call); everyone gets `.btn-quiet` "Copy link" ("✓ Link copied", same as playground).

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

## 10. Live dashboards redesign (v5, owner approved 20 October 2026)

Source of truth: the approved mock `.superpowers/brainstorm/58114-1792435182/content/live-dashboards-v5.html` (final; v1 to v4 are older). Where this section and the mock disagree, this section wins. Owner decisions of 20 October 2026, all approved:

1. The v5 look applies to the whole app: theme tokens, dark default plus a light theme with a persisted toggle, navbar option A, the status bar on every page, a report style dashboard view, widget actions shown on hover or focus only, faint widget borders, a share icon menu.
2. The landing page showcase is removed. Official dashboards replace it: normal dashboard, widget and link entities written by the dashboard wallet and marked official (§10.8). The `/showcase` route redirects to `/explore`.
3. Official items are kept alive by the app wallet before they expire (spec §9.9).
4. A seed script creates the Official dashboards through server operations and is idempotent (spec §9.8).
5. Fork is out of scope. No fork button, no fork counts.
6. Chart types `stacked-bar` and `histogram` are added. Time range pickers are dropped everywhere.
7. `/widgets` becomes the Widgets tab of `/explore` (tabs Dashboards and Widgets). `/widgets/<key>` and `/widgets/new` stay.
8. The UI stays an end user demo: no operator or debug controls.

### 10.1 Theme tokens

`app/theme.css` defines every token on `:root` (dark, the default). The light set applies under `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { … } }` and under `:root[data-theme="light"]`. Token names are unchanged from the old theme; five tokens are new: `--accent-strong`, `--accent-hover`, `--text-3b`, `--ui-edge`, `--border-faint`.

Dark (default):

| Group | Tokens |
| :--- | :--- |
| Surfaces | `--surface:#121212` `--card:#171717` `--card-2:#1f1f1f` `--inset:#0e0e0e` `--border:#262626` `--border-strong:#333333` `--grid:#222222` `--border-faint:#242424` |
| Text | `--text:#ededed` `--text-2:#a1a1a1` `--text-3:#707070` `--text-3b:#8f8f8f` `--ui-edge:#707070` |
| Accent | `--accent:#3ecf8e` `--accent-ink:#06261a` `--accent-soft:rgba(62,207,142,.12)` `--accent-strong:#3ecf8e` `--accent-hover:#5bd9a0` |
| Series | `--c1:#3ecf8e` `--c2:#e69f00` `--c3:#56b4e9` `--c4:#cc79a7` `--c5:#f0e442` `--c6:#e8743b` `--c7:#8ea8ff` `--c8:#b0b0b0` `--c-other:#6b6b6b` |
| States | `--ok:#3ecf8e` `--ok-soft:rgba(62,207,142,.12)` `--warn:#f5b74f` `--warn-soft:rgba(245,183,79,.12)` `--bad:#f87171` `--bad-soft:rgba(248,113,113,.12)` `--info:#7cb7f0` `--info-soft:rgba(124,183,240,.12)` |
| SQL syntax | `--sx-kw:#3ecf8e` `--sx-fn:#c4a7f5` `--sx-str:#f0c674` `--sx-num:#f5a35c` `--sx-cm:#707070` `--sx-op:#a1a1a1` |
| Shape | `--r-sm:4px` `--r-md:6px` `--r-lg:8px` `--gutter:20px` (16px under 720px) `--shadow-pop:0 10px 28px rgba(0,0,0,.55)` `--status-h:30px` |
| Fonts | `--font-ui:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif` `--font-mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace` |

`color-scheme:dark` on the dark set, `color-scheme:light` on the light set.

Light:

| Group | Tokens |
| :--- | :--- |
| Surfaces | `--surface:#fbfbfa` `--card:#ffffff` `--card-2:#f4f4f3` `--inset:#f7f7f6` `--border:#e4e4e2` `--border-strong:#d1d1ce` `--grid:#ececea` `--border-faint:#e9e9e7` |
| Text | `--text:#171717` `--text-2:#525252` `--text-3:#8a8a8a` `--text-3b:#636363` `--ui-edge:#8a8a8a` |
| Accent | `--accent:#0d7a4d` `--accent-ink:#06261a` `--accent-soft:rgba(13,122,77,.10)` `--accent-strong:#3ecf8e` `--accent-hover:#34b97c` |
| Series | `--c1:#1f9d68` `--c2:#a86d00` `--c3:#2f8fd0` `--c4:#b5578f` `--c5:#8f6bd9` `--c6:#d0561c` `--c7:#4f6bed` `--c8:#8a8a8a` `--c-other:#8a8a8a` |
| States | `--ok:#0d7a4d` `--ok-soft:rgba(13,122,77,.10)` `--warn:#8a5a00` `--warn-soft:rgba(237,161,0,.14)` `--bad:#c42f2f` `--bad-soft:rgba(227,73,72,.10)` `--info:#2a5fa8` `--info-soft:rgba(42,120,214,.10)` |
| SQL syntax | `--sx-kw:#0d7a4d` `--sx-fn:#8a3fc0` `--sx-str:#8a5a00` `--sx-num:#a34f00` `--sx-cm:#8a8a8a` `--sx-op:#525252` |
| Shape | `--shadow-pop:0 10px 28px rgba(20,20,20,.12)`; radii, gutter and fonts as dark |

Usage rules. `--accent` is for links, focus rings, active underlines, selected states and series 1 (it is dark green in light mode so it passes on white). Filled primary buttons use `--accent-strong` with `--accent-ink` text in both themes; white text on green is never used (2.0:1). `--text-3` is decoration only (dividers, dots, placeholder glyphs); readable muted text uses `--text-3b`. Inputs, selects and toggles draw their boundary with `--ui-edge` (3:1). `--border-faint` is decorative and only outlines dashboard widgets.

### 10.2 Theme switching, typography, shapes

Theme. Dark is the default. When the viewer has not chosen, the theme follows `prefers-color-scheme` and tracks changes live. The toggle stores `light` or `dark` in `localStorage` key `arkiv-sql-theme`; every storage access sits in `try/catch` and a blocked store behaves as unset. No flash on load: a small inline script in `<head>` (before any stylesheet paints) reads the stored value and sets `data-theme` on `<html>` to the stored value or the media query result; the CSS media fallback covers visitors without JavaScript. The toggle is a 36px borderless icon button (moon in dark, sun in light) with `aria-label` "Switch to light theme" or "Switch to dark theme". `<meta name="theme-color">` is `#121212` for dark and `#fbfbfa` for light.

Typography. Body 13.5px/1.5 `--font-ui`, antialiased. Numbers, block heights, keys, timings, chips and table cells use `--font-mono` with tabular numerals. Page title (Explore, My home, widget page) 24px weight 600, letter spacing `-.02em`. Report title 38px weight 600, `-.025em`, line height 1.1 (26px under 720px). Landing hero title 54px weight 800, `-.035em` (38px under 720px). Section heading 20px weight 600. Card and figure titles 15px weight 600. Small caps labels (key figure labels, panel labels, eyebrows): 11.5px to 12px mono, uppercase, letter spacing `.06em` to `.08em`, `--text-2` or `--text-3b`.

Buttons. `.btn`: min height 34px, padding 0 12px, 13px weight 500, `--r-md`, background `--card-2`, border `--border-strong`; hover background `--border`, border `--ui-edge`. `.btn-primary`: `--accent-strong` fill and border, `--accent-ink` text, weight 600; hover `--accent-hover`. `.btn-outline`: transparent, `--border-strong` border, `--text`, icon in `--accent`; hover border `--accent`. `.btn-quiet`: transparent, no border, `--text-2`; hover `--card-2`. `.btn-lg` 40px and 14px; `.btn-sm` 30px and 12.5px. Icon button `.ib`: 32px square (44px `.ib-lg` on touch), transparent; hover or open `--card-2` with `--border-strong`. Icon buttons always carry `aria-label`; a CSS tooltip (`data-tip`) repeats the label on hover and focus.

Chips. `.chip`: 22px min height, padding 1px 7px, `--r-sm`, 11.5px mono weight 500, 1px `--border-strong`, `--text-2`. Variants: `.chip-warn`, `.chip-bad`, `.chip-ok`, `.chip-official` (`--info` text on `--info-soft`, border `--info` at 45%). Every chip pairs an icon with words: clock "6d 23h left", triangle "Expires in 3h", slashed circle "Expired", shield "Official", clock "Kept live". The index `StateChip` keeps its current markup and classes.

Shapes. Cards and panels: `--card`, 1px `--border`, `--r-lg`, no shadow except an inset hairline `0 1px 0 rgba(255,255,255,.02) inset`. Popovers and menus: `--card`, 1px `--border-strong`, `--r-lg`, `--shadow-pop`. Focus ring everywhere: `outline: 2px solid var(--accent); outline-offset: 2px`.

### 10.3 Navbar (option A, calm)

Height 56px, `--surface` background, 1px `--border` bottom, sticky. Three column grid `1fr auto 1fr`. Left: brand (22px `--accent-strong` square with "A" in `--accent-ink`, then "Arkiv" and "SQL Indexer" in `--text-2`), linking to `/`. Centre: plain text links Home (`/`), Explore (`/explore`), Playground (`/playground`), About (`/about`); 40px tall, 13.5px weight 400, `--text-2`, no borders, no boxes, no icons. Hover: `--text`. Current page: `--text`, weight 500, a 2px `--accent` underline inset 12px from each side and 4px above the bottom, plus `aria-current="page"`. Explore is current on `/explore`, `/d/*` and `/widgets/*`; nothing is current on `/me`. Right: index `StateChip` (title "Index status, details in the status bar below"), theme toggle, then "Log in" as `.btn .btn-outline` with a login icon when logged out, or the account trigger when logged in (borderless button with avatar dot, short address and chevron) that opens the account popover of plan 11. The theme toggle and these buttons share a 34px height.

Phone (under 720px): the centre links hide. Right side keeps the state chip and a 44px menu button (`aria-expanded`, `aria-controls`, label "Open menu" or "Close menu"). It opens a sheet under the bar (`--surface`, bottom border) with the four links as 48px rows (current row marked by a 6px `--accent` dot and "Current" text), then a row with the Build button (or avatar menu) and the theme toggle. Opening moves focus to the first link; Escape or a link click closes it and returns focus to the menu button.

### 10.4 Status bar

The existing fixed status bar (`StatusBarView`, 30px, bottom of the viewport) appears on every page: `/`, `/explore`, `/playground`, `/about`, `/me`, `/d/<key>`, `/d/<key>/edit`, `/widgets/<key>`, `/widgets/new`. Every page passes the same index state the status bar already uses (`useIndex().state`). Markup and copy are unchanged; it picks up the new tokens. The body keeps `padding-bottom: var(--status-h)`.

### 10.5 Landing `/`

Hero: eyebrow "Read only SQL index for Arkiv" in `--accent`, title "Explore live Arkiv data, in SQL.", lede "Browse dashboards the community builds on Arkiv, open any chart to see its SQL, or write your own. Every query runs in DuckDB in this tab." CTAs: `.btn-primary .btn-lg` "Explore dashboards" with arrow (to `/explore`), `.btn .btn-lg` "Open playground", and a plain link "Build your dashboard" with arrow (logged out it starts login, logged in it goes to `/me`). The four live figures and the pipeline strip stay with their current queries; the figure grid uses the bordered tile style of the mock (mono 30px values).

Official dashboards band replaces the old showcase preview cards. Heading "Official dashboards", sub line "Live network reports kept on Arkiv by this app. Open one to see every chart and its SQL.", right aligned `.btn-quiet` "All dashboards" with arrow to `/explore`. Grid of `DashboardBrowseCard` (3 columns, 2 under 1100px, 1 under 700px, 12px gap), official dashboards in seed order. Loading: three skeleton cards. None found: "Official dashboards are not set up on this deployment yet." with a link "Explore community dashboards". Dashboards disabled: the band is not rendered. The activity feed and the story chapters stay below.

`DashboardBrowseCard`: `--card`, 1px `--border`, `--r-lg`; hover border `--ui-edge` and a 2px lift (no lift under reduced motion). Top thumb (`--inset`, 120px, bottom border) shows up to eight `ChartIcon` tiles (24px icons in 4 columns, `--card-2` tiles, `--text-3b` icons) for the chart types on the dashboard; an empty dashboard shows "No widgets yet" in `--text-3b`. Body: byline (Official chip plus "Arkiv SQL Indexer" for official, else a short address), title as the card link (whole card clickable through a stretched link, focus ring on the card), optional description (2 lines, clamped), footer meta "8 widgets" and a chip on the right: "Kept live" for official, otherwise `TimeLeft`.

### 10.6 Explore `/explore`

Page header: h1 "Explore" and the sub line "Every dashboard and widget is public and stored on Arkiv. Open one to see its live data and SQL." stacked on the left. There is no live note in the header (owner feedback, 20 October 2026); the status bar shows the index state. Tabs (`role="tablist"`, label "Explore"): "Dashboards" with `.tab-n` count, "Widgets" with count. 40px tabs, 13.5px, selected tab `--text` with a 2px `--accent` underline. Arrow keys move between tabs (roving tabindex). The selected tab lives in `?tab=` (`dashboards` default, `widgets`); other parameters are kept.

Toolbar (owner feedback, 20 October 2026), shared by both tabs. Row one: search field with a leading search icon (flex 1), sort select, toggles styled as switch chips ("Official only" on Dashboards, "Mine only" on Widgets when logged in) and the primary action right aligned ("New dashboard" or "New widget", plus icon). Every control in row one is 36px tall (44px on touch and under 720px, where the row wraps and search takes the full width). Row two: filters on the left and the result count on the right in 12px mono `--text-3b` ("38 dashboards, newest first", "12 widgets"), hidden when zero.

Dashboards tab: search "Search dashboards by title or creator 0x…", sort "Newest / Most widgets / Expiring soon", "Official only". "New dashboard" opens `/me?new=dashboard`, which opens the create dialog (logged out it starts login first). Grid of `DashboardBrowseCard` (3 columns, 2 under 1100px, 1 under 700px), pages of 12 with "Load 12 more". Chart type filters are not offered on this tab (design call).

Widgets tab: row two holds the chart type filter as a compact segmented control ("All charts" plus the nine types, horizontally scrollable); under 720px it becomes a "Chart type" select. Cards keep their visible "+ Add to dashboard" action. Official widgets show the Official chip in the byline and "Kept live" instead of `TimeLeft`.

Empty and loading states use the shared `EmptyState` (centered, dashed border, 64px icon tile, title, body, actions) and skeleton cards; a loading list never shows an empty state. Copy lives in plan 11, Task 2.

### 10.7 Dashboard view `/d/<key>` (report)

Width: max 1180px, centred, padding 36px 56px 56px (16px under 720px). Breadcrumb: "Explore / Dashboards / <title>" (links to `/explore` and `/explore?tab=dashboards`), 13px `--text-3b`.

Report header (bottom border `--border`, 28px bottom padding). Top row: eyebrow (11.5px mono uppercase `--text-3b`): Official chip plus "Network report" for official dashboards, "Dashboard" otherwise; right side a toolbar (`role="toolbar"`, label "Dashboard actions") of quiet icon buttons. Owner: Organize (pencil, link to `/d/<key>/edit`, label "Organize dashboard") and Add widgets (plus, link to `/d/<key>/edit?import=1`, label "Add widgets"). Everyone: Share (label "Share dashboard"). Owners never get filled buttons here. Then the title (h1, report title style), the description when not blank (16px/1.6 `--text-2`, max 62ch), and the meta line: "By <who>" (`Arkiv SQL Indexer` for official, otherwise `AddressLink`), "8 widgets", pulse dot "Live, computed in your browser", "Updated 2 min ago" (block age of the dashboard `updatedAt` against the head), separated by `·` in `--text-3`.

Share menu. A menu button (`aria-haspopup="menu"`, `aria-expanded`, `aria-controls`). The menu (`role="menu"`, min width 184px, right aligned under the button) has two items: "Copy link" (copy icon; copies `location.origin + '/d/' + key`; the item text becomes "✓ Link copied" for 2 seconds and an `aria-live="polite"` region announces it) and "Post on X" (X icon; a link to `https://x.com/intent/post?text=<title>, a live report on Arkiv SQL Indexer&url=<dashboard url>` with both values URL encoded, `target="_blank"`, `rel="noopener noreferrer"`). Enter or Space opens and focuses the first item; ArrowDown and ArrowUp move with wrap; Home and End jump; Escape closes and refocuses the button; a click outside closes. Items are 36px tall (44px on touch).

Figures. Grid of 12 columns, 20px gap, spans as §6 (xs 3, sm 4, md 6, xl 12; under 1100px xs and sm 6, md and xl 12; under 700px all 12). Every widget is a figure: `--card` background, 1px `--border-faint` border, 4px radius, no shadow, padding 20px 22px 22px. Hover darkens the border to `--border`. Caption: non counter figures get an eyebrow "Figure N" (11px mono uppercase `--accent`, numbered in order over live non counter figures), then the widget name (15px weight 600 `--text`), then an optional sub line in `--text-3b` ("Imported from 0x4a…c2" when the widget creator differs from the dashboard creator). Counter figures (key figures) use a 12px mono uppercase `--text-2` label and a 34px mono weight 600 value. Body has 12px top padding; charts keep their existing heights.

Widget actions are hidden until the figure is hovered or contains focus. They sit in a small floating bar at the top right of the figure (10px from the top and right edges, `--card`, 1px `--border-strong`, `--r-md`, `--shadow-pop`): timing badge, "View SQL" toggle (code icon, `aria-expanded`, label "View SQL for <name>" or "Hide SQL for <name>"), "Open widget" (open icon, link to `/widgets/<key>`, label "Open widget <name>"), and the lifetime chip (`TimeLeft`, or "Kept live" for official widgets). Hidden means `opacity: 0` and `pointer-events: none`, never `display: none` or `visibility: hidden`, so the controls stay in the tab order and `:focus-within` reveals them. On devices without hover (`@media (hover: none)`) the bar is hidden and a 44px overflow button (three dots, label "Actions for <name>", `aria-expanded`) at the top right of the caption toggles it; Escape closes it and refocuses the button. The SQL view opens below the chart as a bordered `--inset` block (1px `--border`, `--r-md`). Expired slots keep the §6 copy inside the same figure frame.

Empty, missing and error states keep the §6 copy. Phone: every figure full width; counters two per row.

### 10.8 Official items

An entity is official when its `user` attribute equals the dashboard wallet address (CONTEXT §11). The UI shows official dashboards and widgets with the Official chip (shield icon), "Arkiv SQL Indexer" as the author instead of an address, and "Kept live" instead of a countdown. Official widgets have no Extend button anywhere (the app wallet renews them). Nobody is the owner of an official dashboard in the UI, so the Organize and Add widgets actions never appear on it. Anyone may import an official widget into their own dashboard.

### 10.9 Chart types `stacked-bar` and `histogram`

| Type | Label | Icon | Renders with |
| :--- | :--- | :--- | :--- |
| stacked-bar | Stacked bar | three columns, each split by a horizontal line | `QueryChart` vertical bars with a shared `stackId`; 100% uses `stackOffset="expand"` |
| histogram | Histogram | four touching columns of different heights | client side binning of one numeric column into equal width bins, drawn as touching vertical columns |

Chart picker order: Table, Counter, Bar, Stacked bar, H bar, Line, Area, Donut, Histogram (nine segments; arrow keys wrap over nine).

Data settings. Stacked bar: "X / label", "Y / values" with "+ Add column", "Group by", Stacking segment with only "Stack" and "100%" (picking Stacked bar turns Off into Stack), Sort. A stacked bar needs a Group by column or at least two Y columns; until then the preview reads "Pick a Group by column or a second Y column to stack." Histogram: "Value column" (numeric columns only) and a "Bins" select "10 / 20 / 30 / 50" (default 20); no Y, Group by, Stacking or Sort. Format for histogram: number format (applied to bin edges), axis titles, data labels; no legend or series colors. A histogram bins the rows the query returns (at most 5,000), and the preview note under the chart reads "Binned from N rows" in `--text-3b`.

Bin labels read `<from>–<to>` with both edges formatted by the number format (an en dash inside a data label is chart text, not prose).

### 10.10 Time ranges

Time range pickers are removed everywhere (owner decision, 20 October 2026). Queries that used a range keep their former default window as fixed SQL and label buckets relative to the head (for example `-23h` to `now`).

### 10.11 Accessibility requirements

- WCAG 2.2 AA. Text contrast at least 4.5:1, large text and UI boundaries at least 3:1, chart marks at least 3:1 against `--card`.
- Every interactive target is at least 32px on pointer devices and 44px under `(hover: none)` and on phones.
- Hover only content always has a keyboard path (`:focus-within`) and a touch path (overflow button). Nothing is revealed by hover alone.
- Menus and tabs follow the ARIA patterns named above, with visible focus and Escape handling.
- Every chart keeps a text alternative (`role="img"` with a label); donuts list values in the legend; the widget page keeps a table view.
- Chips never rely on color alone: each has an icon and words.
- Under `prefers-reduced-motion: reduce` the pulse dot, card lift and transitions stop.
- Under `forced-colors: active` chips, buttons, cards and figures draw `1px solid CanvasText` borders.
- A skip link "Skip to content" is the first focusable element on every page and targets `<main id="main">`.

Contrast pairs checked with the WCAG relative luminance formula (from the mock):

| Theme | Pair | Ratio | Result |
| :--- | :--- | :--- | :--- |
| Dark | `--text` #ededed on `--surface` #121212 | 16.0 | AAA |
| Dark | `--text` on `--card-2` #1f1f1f | 14.08 | AAA |
| Dark | `--text-2` #a1a1a1 on `--card` | 6.94 | AA |
| Dark | `--text-3b` #8f8f8f on `--card-2` | 5.10 | AA |
| Dark | `--text-3` #707070 on `--card` | 3.62 | decoration only |
| Dark | `--accent-ink` #06261a on green #3ecf8e | 8.09 | AAA |
| Dark | focus ring and active green on `--surface` | 9.39 | AA text, 3:1 UI |
| Dark | input border `--ui-edge` on `--card` | 3.62 | 3:1 UI |
| Dark | `--warn` on `--card-2` | 9.24 | AA |
| Dark | `--bad` on `--card-2` | 5.96 | AA |
| Dark | `--info` on `--card-2` | 7.76 | AA |
| Dark | weakest series `--c4` #cc79a7 on `--card` | 5.86 | 3:1 graphics |
| Dark | `--c-other` #6b6b6b on `--card` | 3.36 | 3:1 graphics |
| Light | `--text` #171717 on `--card` #ffffff | 17.93 | AAA |
| Light | `--text` on `--surface` #fbfbfa | 17.31 | AAA |
| Light | `--text-2` #525252 on `--card-2` #f4f4f3 | 7.10 | AA |
| Light | `--text-3b` #636363 on `--card-2` | 5.46 | AA |
| Light | `--accent` #0d7a4d on white | 5.37 | AA |
| Light | `--accent-ink` #06261a on button green #3ecf8e | 8.09 | AAA (white ink only 2.0) |
| Light | `--ui-edge` #8a8a8a on white | 3.45 | 3:1 UI |
| Light | `--border-faint` #e9e9e7 on white | 1.22 | decorative only |
| Light | live chip `--ok` on `--ok-soft` | 4.69 | AA |
| Light | behind chip `--warn` #8a5a00 on `--warn-soft` | 5.32 | AA |
| Light | stale chip `--bad` on `--bad-soft` | 4.87 | AA |
| Light | SQL tokens on `--inset` (weakest `--sx-num` #a34f00) | 5.0 or more | AA |
| Light | chart series on white (weakest `--c1` #1f9d68, `--c8` #8a8a8a) | 3.45 | 3:1 graphics |

The faint widget border is decorative (1.15:1 to 1.22:1); figure boundaries are carried by spacing and captions, never by the border alone.

### 10.12 Other pages

`/me`, `/widgets/new`, `/widgets/<key>`, `/d/<key>/edit`, the import modal, the add to dashboard picker, the login gate, the playground and the about page keep their layout and copy from sections 2 to 9 and take the new tokens, buttons, chips and focus styles. The widget page follows the mock screen 4: breadcrumb "Explore / Widgets / <name>", title with the chart type chip, a facts line (author, "on N dashboards", lifetime chip, "Live, computed in your browser" with timing), actions on the right (`.btn-quiet` "Copy link", `.btn` "Open in playground", `.btn-primary` "+ Add to dashboard"), then a two column body: chart card (with a "Chart / Table" segment) and a read only SQL card ("Copy SQL") on the left; on the right a "Used on N dashboards" panel (up to 4 rows linking to `/d/<key>`, "Show all N" expands the list in place) and a "Lifetime" panel (time left, "Lives for 7 days per extend", key, and the Extend button with its eligibility note when the viewer may extend). The owner view keeps the editor of §4 under the same header.

## 11. User owned widgets (owner decision, 20 October 2026)

Spec §6.5 holds the decision and its reasons. This section holds the flow and the exact copy. It overrides the "Expiry and Extend" paragraph of §0, the saved page and owner rules of §4, the Extend rules of §3 and §7, and the LoginGate body of §2.

### 11.1 Who sees what

- Owner view of `/widgets/<key>` (editor, Delete, Transfer) when the viewer's session address equals the widget's Arkiv owner. Authorship in bylines stays the `user` attribute.
- Extend: every logged in viewer on every live widget owned by a user wallet (not official, and not a legacy widget still owned by the app wallet, since only user owned widgets are permissionlessly extendable), in the places that already offer it (widget page Lifetime panel, `/me` rows, Expiring soon, organize rows). Dashboard figures still show no Extend. Logged out, the Lifetime panel note reads "Log in to extend this widget." and no button shows.
- Lifetime panel eligibility note (replaces both old notes): "Anyone can extend this widget. Your wallet signs and pays a small network fee."
- "My widgets" on `/me`, the "Mine only" explorer toggle and the import modal "My widgets" tab list widgets the viewer owns on Arkiv.

### 11.2 Edit saves a new version

- Owner editor Save button: "Save new version" (was "Save changes").
- Under the header, a quiet note in `--text-3`: "Widgets are read only on Arkiv. Saving creates a new version and moves your dashboards to it."
- After saving, route to `/widgets/<new key>` with the Syncing chip and a `role="status"` note: "Saved as a new version. Your dashboards now use it. The old version stays until it expires, because other dashboards may still use it." followed by a `.btn-quiet` "Delete old version". Dismissing or leaving the page keeps the old version.

### 11.3 Signing dialogs

All three reuse the §0 dialog shell (`role="dialog"`, `aria-modal`, max width 380px, focus trapped, Escape or "Cancel" closes and refocuses the trigger). While signing, the confirm button reads "Waiting for wallet…" and both buttons are disabled.

- Extend: title "Extend “<name>”?", body "Adds N days. New expiry: in 13d 23h. Your wallet signs and pays a small network fee.", buttons "Cancel" and `.btn-primary` "Extend". Done and cap states as in §0.
- Delete (owner only, `.btn-quiet` "Delete widget" in the Lifetime panel and on `/me` rows): title "Delete “<name>”?", body "It disappears from Arkiv now. Dashboards that use it show it as expired. Your wallet signs and pays a small network fee.", buttons "Cancel" and `.btn-primary` "Delete". Success on the widget page routes to `/me`; on `/me` the row disappears optimistically.
- Transfer (owner only, `.btn-quiet` "Transfer" in the Lifetime panel): title "Transfer “<name>”?", body "The new owner can extend, transfer or delete it. You stay the author, but you can no longer delete it or save new versions.", input label "New owner address", placeholder "0x…", buttons "Cancel" and `.btn-primary` "Transfer". Input errors (inline, under the input): "Enter a 0x address with 40 hex characters." and "That is already your address." Success closes the dialog and the page switches to the viewer view.

### 11.4 Wallet errors

Shown as `.error` with `role="alert"` inside the open dialog (the dialog stays open, the trigger keeps its label):

| Cause | Copy |
| :--- | :--- |
| User rejected the request | none (silent, the dialog returns to its confirm state) |
| `NotOwner` | "Only the widget's owner can do this. It may have been transferred." |
| `EntityExpired` or `EntityNotFound` | "This widget has expired. Arkiv no longer has it." |
| Insufficient funds | "Not enough GLM to pay the network fee. Fund your wallet and try again." |
| `ExpiryNotExtended` or cap | "Already at the 90 day maximum" |
| Wallet address differs from the session | "Your wallet changed. Log out and log in again." |
| Anything else | "Your wallet couldn't sign. Try again." |

### 11.5 Balance warning

Balance is read over RPC for the session address when a page with signing actions mounts and after each signature. Threshold 0.1 GLM. Nothing shows while loading or when the read fails (buttons stay enabled).

- Low (above zero, below 0.1): `.state .state-behind` block, `role="status"`: "Low balance: 0.04 GLM. Extending, transferring or deleting needs at least 0.1 GLM on Tiramisu. Fund 0x4a…c2." with a `.btn-quiet` "Copy address" (shows "✓ Copied" for 2 seconds). Actions stay enabled.
- Empty (zero): same block with "Your wallet has no GLM. Extending, transferring or deleting needs at least 0.1 GLM on Tiramisu. Fund 0x4a…c2." Extend, Delete, Transfer and "Delete old version" are disabled with title "Fund your wallet to sign".
- Placement: under the `/me` header, and inside the Lifetime panel of the widget page above its buttons.

### 11.6 Copy changes elsewhere

- LoginGate body (§2): "Use Google, Discord, X or Telegram. Saving widgets and dashboards is free and nothing personal goes on chain. Your widgets belong to your wallet; extending, transferring or deleting them is signed by it and needs a little GLM."
- §0 "Our wallet pays, you pay nothing." is replaced by the §11.3 Extend body.
