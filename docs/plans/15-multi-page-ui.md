# Plan 15: Multi Page UI

> For agentic workers: three agents implement Tasks A, B and C in parallel. Each owns only the files listed for its task.

## Required Reading

1. `docs/plans/CONTEXT.md`
2. `apps/web/AGENTS.md` and the Next.js 16 guides it points to (App Router, `next/link`, client components)
3. Current UI: `apps/web/app/page.tsx`, `apps/web/app/theme.css` (design tokens), `apps/web/components/dash/*`, `apps/web/lib/{use-index,use-query,views,hash-state,heights,format}.ts`
4. Approved visual language: `docs/design/dashboard-mock.html` (tokens, cards, run badges). Keep it; this plan changes structure and spacing, not the visual language.

**Decision (user, 18 October 2026):** the single page is cluttered. Split into pages: a clean landing page, a showcase page for chart cards with proper spacing, and a dedicated SQL playground with snippet cards in a left sidebar instead of a dropdown. Landing: header area about 70% of the viewport height, infographic, with a few live stats, clean, ample free space; an About the project section at the bottom.

## Shared Contract (all tasks)

- Routes: `/` landing (Task A), `/showcase` (Task B), `/playground` (Task C).
- `useIndex()` (`lib/use-index.ts`) is a module singleton; it survives client navigation. Every page is a client component that calls it and renders `<TopBar state={state}/>`, its content, then `<Footer/>`.
- Nav: Task A adds links Overview `/`, Showcase `/showcase`, Playground `/playground` to `TopBar` using `next/link`, with the active route marked (`usePathname`, `aria-current="page"`). Tasks B and C just render `TopBar`.
- Opening SQL in the playground from anywhere: navigate to `/playground#<encoded>` where the hash is produced by `encodeSqlHash(sql: string): string` in `lib/hash-state.ts` (Task C adds it; it returns the same encoding `writeHash` uses, without `#`). Until Task C lands, B and A may import it; Task C must export exactly this name.
- Styling: each task puts new styles in its own CSS module (`app/<route>/page.module.css` or `components/<area>/*.module.css`) and uses the tokens in `app/theme.css`. Only Task A may edit `app/theme.css`, and only to add tokens or fix the top bar.
- Spacing scale: 8 px base (8, 16, 24, 32, 48, 64, 96). Content max width as today. Cards in a grid with at least 24 px gaps, consistent internal padding (24 px desktop, 16 px phone), aligned headers, no cramped badges.
- End user demo: no operator or debug controls, no banners. Status only in the top bar heights cluster.
- Layout works at 1440 px and 390 px width without horizontal page scroll.
- Tests: `bun test apps/web`; `bunx tsc --noEmit -p apps/web` (known `bun:test` errors only); `bun run build` in `apps/web`.
- No new dependencies. No mutating git commands. Do not touch `data/`, `apps/indexer`, `packages/`. No dashes as punctuation in docs or UI copy.

---

### Task A: Landing page and shell

**Owns:** `app/page.tsx`, `app/layout.tsx`, `app/theme.css`, `components/dash/{TopBar,Hero,StatTile,WhySqlStrip,Footer,ActivityFeed}.tsx`, new `components/landing/*`, `app/page.module.css`.

- Top bar nav as in the Shared Contract.
- Hero takes about 70vh: headline, one line pitch, two calls to action (Explore showcase, Open playground), and an infographic made from live SQL: a small set of stat figures (live entities, distinct creators, expiring within 1 hour, created in the last hour) plus one visual that explains the pipeline (Arkiv chain, public logs, indexer, Parquet snapshot plus delta, DuckDB in your browser) with the measured query time. Generous whitespace; no more than about six numbers visible.
- Fill progress line stays, small and quiet, inside the hero.
- Below the hero: a short preview strip linking to Showcase and Playground (two or three cards, not full widgets), then Latest changes (ActivityFeed, compact), then About the project.
- About the project: what it is (self hosted, read only SQL index over Arkiv; rows vanish when they expire on chain), how it works (log replay, newest first attribute fill on the public RPC with no API key, versioned Parquet plus JSON delta, DuckDB WASM, browser live tail, verify a row on chain), why SQL (joins, group by, window functions that `arkiv_query` cannot express), open source and security notes (read only, no keys in the browser, expiry enforced in the browser), and links (repository placeholder `#`, Arkiv docs). Plain sentences, no marketing fluff.
- The old ShowcaseGallery and QueryConsole are removed from the landing page.

### Task B: Showcase page

**Owns:** new `app/showcase/*`, `components/dash/{ShowcaseGallery,ViewTabs,WidgetCard,SqlBlock,RunBadge,NotInArkivQueryBadge,AreaChart,DonutChart,HBarChart,StackedBarChart,ColumnChart,DataTable,TypeTag,Tooltip}.tsx`, new `components/showcase/*`.

- Page header (title, one sentence, count of views and widgets), view tabs, then a card grid with proper spacing: 12 column grid; stat cards small, charts span 6, tables span 12 (or as `span` in `VIEWS` maps sensibly); equal heights per row; chart areas have fixed heights so cards align.
- Each card: title, subtitle, chart, footer row with run badge, row count, the `notInArkivQuery` badge, "View SQL" toggle, and "Open in playground" (navigates to `/playground#<encodeSqlHash(sql)>`).
- View tab selection reflected in the URL (`?view=expiry`) so it is shareable.

### Task C: SQL playground page

**Owns:** new `app/playground/*`, `components/dash/{QueryConsole,QueryHistory,ResultsGrid,RowActions,VerifyChip}.tsx`, new `components/playground/*`, `lib/hash-state.ts`, `lib/sql-complete.ts`.

- Layout: left sidebar (about 300 px, collapsible to a drawer on phone) with snippet cards grouped by view (from `VIEWS`, plus the default "Open tickets with most discussion" snippet), each card showing title, short subtitle, the `notInArkivQuery` badge and a one line SQL preview; a search box filters snippets by title or SQL. Clicking a card loads it into the editor (does not auto run); the active snippet is highlighted.
- Main area: editor (CodeMirror with existing autocomplete and highlighting) filling the available height, run bar (Run, Cancel, Ctrl or Cmd + Enter hint), results grid with run badge and CSV, query history as a compact tab or panel next to results, not a second sidebar.
- Schema help: a small collapsible list of tables and columns (`entities`, `attributes`) inside the sidebar below snippets, clicking a column inserts it.
- Hash: reads the initial SQL from the URL hash on load and on `hashchange`; add and export `encodeSqlHash`.
