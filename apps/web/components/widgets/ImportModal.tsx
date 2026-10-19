'use client'
import { WidgetPayloadError } from './WidgetPayloadError'
import { useDebounced } from '../../lib/dash/use-debounced'
import { showLoading } from '../../lib/dash/loading'
import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react'
import { useDashAuth } from '../auth/DashAuthProvider'
import { addLabel, initImport, importReducer, type ImportState } from '../../lib/dash/import-state'
import type { ImportCandidate } from '../../lib/dash/organize-state'
import { CHART_TYPES } from '../../lib/dash/schema'
import { widgetCountSql, type WidgetListQuery } from '../../lib/dash/sql'
import { useWidgetList } from '../../lib/dash/use-widget-list'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { ChartIcon } from './ChartIcon'
import { CHART_LABELS } from './ChartPicker'
import { WidgetBrowseCard } from './WidgetBrowseCard'

type List = ReturnType<typeof useWidgetList>
type Props = { dashboardTitle: string; placed: Set<string>; remaining: number; onAdd(widgets: ImportCandidate[]): void; onClose(): void;
 listOverride?: List & { mineTotal: number | null; allTotal: number | null }; initialState?: ImportState }
type CardsProps = { list: List; state: ImportState; placed: Set<string>; head?: number; version: number; toggle(key: string): void }
function Cards({ list, state, placed, head, version, toggle }: CardsProps) {
 return <><WidgetPayloadError error={list.payloadError}/>{list.items.map(item => <WidgetBrowseCard key={item.key} item={item} payload={list.payloads?.get(item.key) ?? (list.payloads ? null : undefined)}
  head={head} version={version} variant="pick" selected={state.selected.includes(item.key)} disabled={placed.has(item.key)} onToggle={() => toggle(item.key)}/>)}
  {showLoading({ loading: list.loading, data: list.total }) && <p role="status">Loading the index into your browser…</p>}
  {list.error && <p className="error" role="alert">{list.error}</p>}
 </>
}
function LivePage({ q, version, remember, ...props }: Omit<CardsProps, 'list'> & { q: WidgetListQuery; remember(list: List): void }) {
 const list = useWidgetList(q, version)
 useEffect(() => { remember(list) }, [list.items.map(item => item.key).join(','), list.payloads, remember])
 return <Cards {...props} version={version} list={list}/>
}
function LiveResults({ state, user, placed, toggle, remember }: { state: ImportState; user?: string; placed: Set<string>; toggle(key: string): void; remember(list: List): void }) {
 const { state: index, version } = useIndex()
 const q = { search: state.search, chart: state.chart, sort: 'newest' as const, user: state.tab === 'mine' ? user ?? null : null, limit: 12 }
 if (state.tab === 'mine' && !user) return null
 return <>{Array.from({ length: state.pages }, (_, page) => <LivePage key={`${state.tab}:${state.search}:${state.chart}:${page}`} q={{ ...q, offset: page * 12 }} state={state}
  placed={placed} toggle={toggle} head={index.liveHead} version={version} remember={remember}/>)}</>
}
function Counts({ state, user, onCounts }: { state: ImportState; user?: string; onCounts(mine: number | null, all: number | null): void }) {
 const { config } = useDashAuth()
 const { version } = useIndex()
 const filter = { search: state.search, chart: state.chart }
 const all = useTimedQuery(config?.enabled ? widgetCountSql(config.wallet, { ...filter, user: null }) : '', version, { skip: !config?.enabled })
 const mine = useTimedQuery(config?.enabled && user ? widgetCountSql(config.wallet, { ...filter, user }) : '', version, { skip: !config?.enabled || !user })
 const allCount = all.data ? Number(all.data.rows[0]?.[0] ?? 0) : null
 const mineCount = !user ? 0 : mine.data ? Number(mine.data.rows[0]?.[0] ?? 0) : null
 useEffect(() => { onCounts(mineCount, allCount) }, [mineCount, allCount, onCounts])
 return null
}
export function ImportModal({ dashboardTitle, placed, remaining, onAdd, onClose, listOverride, initialState }: Props) {
 const auth = useDashAuth()
 const [state, dispatch] = useReducer(importReducer, initialState ?? initImport())
 const [search, setSearch] = useState(initialState?.search ?? '')
 const debouncedSearch = useDebounced(search)
 useEffect(() => { dispatch({ type: 'search', value: debouncedSearch }) }, [debouncedSearch])
 const [counts, setCounts] = useState<{ mine: number | null; all: number | null }>({ mine: null, all: null })
 const candidates = useRef(new Map<string, ImportCandidate>())
 const dialog = useRef<HTMLDivElement>(null)
 const title = useId()
 const remember = useCallback((list: List) => {
  for (const item of list.items) candidates.current.set(item.key, { key: item.key, name: item.name, chart: item.chart, user: item.user,
   owner: item.owner, expiresAt: item.expiresAt, lifetimeDays: list.payloads?.get(item.key)?.widget.lifetimeDays ?? candidates.current.get(item.key)?.lifetimeDays ?? null })
 }, [])
 const onCounts = useCallback((mine: number | null, all: number | null) => setCounts({ mine, all }), [])
 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null
  dialog.current?.querySelector<HTMLElement>('button, input, a[href]')?.focus()
  return () => previous?.focus()
 }, [])
 const mine = listOverride ? listOverride.mineTotal : counts.mine
 const all = listOverride ? listOverride.allTotal : counts.all
 const total = state.tab === 'mine' ? mine : all
 const toggle = (key: string) => dispatch({ type: 'toggle', key, disabled: placed, remaining })
 return <div className="import-backdrop">
  <style>{`.import-backdrop{position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:color-mix(in srgb,var(--surface) 70%,transparent)}
.import-dialog{width:calc(100% - 32px);max-width:880px;max-height:calc(100dvh - 48px);display:flex;flex-direction:column;background:var(--card);border:1px solid var(--border-strong);border-radius:var(--r-lg);box-shadow:var(--shadow-pop);overflow:hidden}
.import-header,.import-controls{padding:16px 24px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.import-header h2{flex:1;margin:0}.import-controls input{width:100%;min-height:34px;padding:0 12px;background:var(--inset);color:var(--text);border:1px solid var(--ui-edge);border-radius:var(--r-md);font:inherit}.import-types{display:flex;gap:4px;overflow-x:auto;width:100%}.import-types button{flex-shrink:0}
.import-results{padding:16px 24px;overflow-y:auto;flex:1;min-height:0}.import-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.import-grid>article{grid-column:auto}
.import-footer{position:sticky;bottom:0;display:flex;align-items:center;gap:8px;padding:16px 24px;background:var(--card);border-top:1px solid var(--border)}.import-footer>span{margin-right:auto}
@media(max-width:900px){.import-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.import-dialog{width:100%;height:100dvh;max-height:100dvh;border-radius:0}.import-grid{grid-template-columns:minmax(0,1fr)}}`}</style>
  <div ref={dialog} className="import-dialog" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1} onKeyDown={event => {
   if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
   if (event.key !== 'Tab') return
   const focusable = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]'))
   const index = focusable.indexOf(document.activeElement as HTMLElement)
   if (event.shiftKey ? index <= 0 : index === focusable.length - 1 || index < 0) {
    event.preventDefault(); (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus()
   }
  }}>
   <header className="import-header"><h2 id={title}>Import widgets into “{dashboardTitle}”</h2><button type="button" className="btn btn-quiet" aria-label="Close import" onClick={onClose}>✕</button></header>
   <div className="import-controls">
    <div className="tabs" role="tablist" aria-label="Widget source">{(['mine', 'all'] as const).map(tab => <button key={tab} type="button" className="tab" role="tab" aria-selected={state.tab === tab} onClick={() => dispatch({ type: 'tab', value: tab })}>{tab === 'mine' ? 'My widgets' : 'All widgets'} <span className="tab-n">{(tab === 'mine' ? mine : all) ?? '…'}</span></button>)}</div>
    <input aria-label="Search by name or creator address" placeholder="Search by name or creator address" value={search} onChange={event => setSearch(event.target.value)}/>
    <div className="import-types" role="group" aria-label="Chart type">{([null, ...CHART_TYPES] as const).map(chart => <button key={chart ?? 'all'} type="button" className="fchip" aria-pressed={state.chart === chart} onClick={() => dispatch({ type: 'chart', value: chart })}>{chart && <ChartIcon type={chart}/>} {chart ? CHART_LABELS[chart] : 'All'}</button>)}</div>
   </div>
   {!listOverride && <Counts state={state} user={auth.address} onCounts={onCounts}/>}
   <div className="import-results">
    {total === 0 ? <p>{state.tab === 'mine' && !state.search && !state.chart ? <>You have no widgets yet. <a className="btn" href="/widgets/new">+ New widget</a></> : 'No widgets match these filters.'}</p> : <div className="import-grid">
     {listOverride ? <Cards list={listOverride} state={state} placed={placed} toggle={toggle} version={0}/> : <LiveResults state={state} user={auth.address} placed={placed} toggle={toggle} remember={remember}/>}
    </div>}
    {total !== null && state.pages * 12 < total && <button type="button" className="btn" onClick={() => dispatch({ type: 'more' })}>Load more</button>}
   </div>
   <footer className="import-footer"><span aria-live="polite">{state.selected.length} selected</span><button type="button" className="btn" onClick={onClose}>Cancel</button>
    <button type="button" className="btn btn-primary" disabled={!state.selected.length || state.selected.length > remaining} onClick={() => {
     if (listOverride) remember(listOverride)
     onAdd(state.selected.filter(key => !placed.has(key)).slice(0, remaining).flatMap(key => { const item = candidates.current.get(key); return item ? [item] : [] }))
     onClose()
    }}>{addLabel(state.selected.length)}</button>
   </footer>
  </div>
 </div>
}
