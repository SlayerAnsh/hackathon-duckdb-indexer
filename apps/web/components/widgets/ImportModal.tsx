'use client'
import Link from 'next/link'
import { WidgetPayloadError } from './WidgetPayloadError'
import { useDebounced } from '../../lib/dash/use-debounced'
import { showLoading } from '../../lib/dash/loading'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
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
import { EmptyState, PlusIcon, SkeletonCards } from './EmptyState'
import { Dialog } from '../ui/Dialog'
import m from './import.module.css'

type List = ReturnType<typeof useWidgetList>
type Props = { dashboardTitle: string; placed: Set<string>; remaining: number; onAdd(widgets: ImportCandidate[]): void; onClose(): void;
 listOverride?: List & { mineTotal: number | null; allTotal: number | null }; initialState?: ImportState }
type CardsProps = { list: List; state: ImportState; placed: Set<string>; head?: number; version: number; toggle(key: string): void }
function Cards({ list, state, placed, head, version, toggle }: CardsProps) {
 return <><WidgetPayloadError error={list.payloadError}/>{list.items.map(item => <WidgetBrowseCard key={item.key} item={item} payload={list.payloads?.get(item.key) ?? (list.payloads ? null : undefined)}
  head={head} version={version} variant="pick" selected={state.selected.includes(item.key)} disabled={placed.has(item.key)} onToggle={() => toggle(item.key)}/>)}
  {showLoading({ loading: list.loading, data: list.total }) && <SkeletonCards count={2} label="Loading widgets…"/>}
  {list.error && <div className={`notice notice-bad ${m.wide}`} role="alert"><div><p className="notice-title">Could not load widgets</p><p>{list.error}</p></div></div>}
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
 const remember = useCallback((list: List) => {
  for (const item of list.items) candidates.current.set(item.key, { key: item.key, name: item.name, chart: item.chart, user: item.user,
   owner: item.owner, expiresAt: item.expiresAt, lifetimeDays: list.payloads?.get(item.key)?.widget.lifetimeDays ?? candidates.current.get(item.key)?.lifetimeDays ?? null })
 }, [])
 const onCounts = useCallback((mine: number | null, all: number | null) => setCounts({ mine, all }), [])
 const mine = listOverride ? listOverride.mineTotal : counts.mine
 const all = listOverride ? listOverride.allTotal : counts.all
 const total = state.tab === 'mine' ? mine : all
 const toggle = (key: string) => dispatch({ type: 'toggle', key, disabled: placed, remaining })
 const over = state.selected.length > remaining
 const add = () => {
  if (listOverride) remember(listOverride)
  onAdd(state.selected.filter(key => !placed.has(key)).slice(0, remaining).flatMap(key => { const item = candidates.current.get(key); return item ? [item] : [] }))
  onClose()
 }
 return <Dialog open onClose={onClose} size="lg" className={m.dialog} title={`Import widgets into “${dashboardTitle}”`}
  description={remaining === 0 ? 'This dashboard is full. Remove a widget on Organize to make room.' : `Pick saved widgets to place on this dashboard. ${remaining} ${remaining === 1 ? 'slot' : 'slots'} left.`}
  footer={<>
   <span className={`dialog-f-start ${m.count}`} aria-live="polite"><strong>{state.selected.length} selected</strong>{over && <span className={m.over}> · only {remaining} {remaining === 1 ? 'fits' : 'fit'}</span>}</span>
   <button type="button" className="btn" onClick={onClose}>Cancel</button>
   <button type="button" className="btn btn-primary" disabled={!state.selected.length || over} onClick={add}>{addLabel(state.selected.length)}</button>
  </>}>
  <div className={m.controls}>
   <div className={`tabs ${m.tabs}`} role="tablist" aria-label="Widget source">{(['mine', 'all'] as const).map(tab => <button key={tab} type="button" className="tab" role="tab" aria-selected={state.tab === tab} onClick={() => dispatch({ type: 'tab', value: tab })}>{tab === 'mine' ? 'My widgets' : 'All widgets'} <span className="tab-n">{(tab === 'mine' ? mine : all) ?? '…'}</span></button>)}</div>
   <div className={`input-group ${m.searchBox}`}>
    <span className="adorn" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg></span>
    <input type="search" data-autofocus aria-label="Search by name or creator address" placeholder="Search by name or creator address" value={search} onChange={event => setSearch(event.target.value)}/>
    {search && <button type="button" className="ib ib-sm" aria-label="Clear search" onClick={() => setSearch('')}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>}
   </div>
   <div className={m.types} role="group" aria-label="Chart type">{([null, ...CHART_TYPES] as const).map(chart => <button key={chart ?? 'all'} type="button" className="fchip" aria-pressed={state.chart === chart} onClick={() => dispatch({ type: 'chart', value: chart })}>{chart && <ChartIcon type={chart}/>}{chart ? CHART_LABELS[chart] : 'All types'}</button>)}</div>
  </div>
  {!listOverride && <Counts state={state} user={auth.address} onCounts={onCounts}/>}
  <div className={m.results}>
   {total === 0 ? (state.tab === 'mine' && !state.search && !state.chart
    ? <EmptyState compact icon="widget" title="You have no widgets yet" body="Save a query as a widget, then import it here. You can also pick from all public widgets." actions={<><Link className="btn btn-primary" href="/widgets/new"><PlusIcon/>New widget</Link><button type="button" className="btn" onClick={() => dispatch({ type: 'tab', value: 'all' })}>All widgets</button></>}/>
    : <EmptyState compact icon="search" title="No matches" body="No widgets match these filters."/>) : <div className={m.grid}>
    {listOverride ? <Cards list={listOverride} state={state} placed={placed} toggle={toggle} version={0}/> : <LiveResults state={state} user={auth.address} placed={placed} toggle={toggle} remember={remember}/>}
   </div>}
   {total !== null && state.pages * 12 < total && <div className={m.more}><button type="button" className="btn btn-outline" onClick={() => dispatch({ type: 'more' })}>Load more</button><span>{Math.min(state.pages * 12, total)} of {total}</span></div>}
  </div>
 </Dialog>
}
