'use client'
import { WidgetPayloadError } from './WidgetPayloadError'
import { useDebounced } from '../../lib/dash/use-debounced'
import { showLoading } from '../../lib/dash/loading'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useDashAuth } from '../auth/DashAuthProvider'
import { explorerQuery, explorerReducer, mergeExplorerItems, type ExplorerState } from '../../lib/dash/explorer-state'
import { CHART_TYPES, type ChartType } from '../../lib/dash/schema'
import { widgetCountSql, type WidgetListItem, type WidgetListQuery } from '../../lib/dash/sql'
import { useWidgetList } from '../../lib/dash/use-widget-list'
import { usePending, useSynced, type PendingWrite } from '../../lib/dash/pending'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { WidgetBrowseCard } from './WidgetBrowseCard'
import { AddToDashboardPicker } from './AddToDashboardPicker'
import { ChartIcon } from './ChartIcon'
import { CHART_LABELS } from './ChartPicker'
import { SyncChip } from './SyncChip'
import s from '../showcase/showcase.module.css'

type Props = { state: ExplorerState; dispatch(a: Parameters<typeof explorerReducer>[1]): void }
export function ExplorerView({ state, dispatch, liveCount, total, loggedIn, loading, children, error }: Props & {
 liveCount: number | null; total: number | null; loggedIn: boolean; loading: boolean; children?: ReactNode; error?: string
}) {
 const [search, setSearch] = useState(state.search)
 useEffect(() => { setSearch(state.search) }, [state.search])
 const debouncedSearch = useDebounced(search)
 useEffect(() => { if (debouncedSearch !== state.search) dispatch({ type: 'search', value: debouncedSearch }) }, [debouncedSearch, state.search, dispatch])
 return <section className="explorer">
  <style>{`.explorer{padding:32px 0;display:grid;gap:24px}.explorer-header,.explorer-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.explorer-header h1{margin:0}.explorer-header a{margin-left:auto}.explorer-controls input:not([type=checkbox]),.explorer-controls select{padding:8px;border:1px solid var(--border);border-radius:var(--r-md);background:var(--inset);color:var(--text);font:inherit;max-width:100%}.explorer-controls input:not([type=checkbox]){flex:1;min-width:240px}.explorer-types{display:flex;gap:4px;overflow-x:auto;max-width:100%}.explorer-types button{flex-shrink:0}.explorer-types button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent)}`}</style>
  <header className="explorer-header"><h1>Widgets</h1><span className="quiet-chip">{liveCount ?? '…'} live</span><a className="btn btn-primary" href="/widgets/new">+ New widget</a></header>
  <div className="explorer-controls">
   <input aria-label="Search by name or creator address" placeholder="Search by name or creator address" value={search} onChange={e => setSearch(e.target.value)}/>
   <div className="explorer-types" role="group" aria-label="Chart type">{([null, ...CHART_TYPES] as const).map(chart => <button type="button" className="btn btn-quiet" key={chart ?? 'all'} aria-pressed={state.chart === chart} onClick={() => dispatch({ type: 'chart', value: chart })}>{chart && <ChartIcon type={chart}/>} {chart ? CHART_LABELS[chart] : 'All'}</button>)}</div>
   <select aria-label="Sort widgets" value={state.sort} onChange={e => dispatch({ type: 'sort', value: e.target.value as ExplorerState['sort'] })}><option value="newest">Newest</option><option value="used">Most used</option><option value="expiring">Expiring soon</option></select>
   {loggedIn && <label><input type="checkbox" checked={state.mine} onChange={e => dispatch({ type: 'mine', value: e.target.checked })}/> Mine only</label>}
  </div>
  {error && <p className="error" role="alert">{error}</p>}
  {loading && <p role="status">Loading the index into your browser…</p>}
  <div className={s.grid}>{children}</div>
  {!loading && !error && total === 0 && (liveCount === 0 ? <p>No widgets yet. Be the first to build one. <a className="btn btn-primary" href="/widgets/new">+ New widget</a></p> : <p>No widgets match these filters. <button className="btn btn-quiet" onClick={() => { setSearch(''); dispatch({ type: 'clear' }) }}>Clear filters</button></p>)}
  {total !== null && state.pages * 12 < total && <button className="btn" onClick={() => dispatch({ type: 'more' })}>Load more</button>}
 </section>
}
function ResultsPage({ q, version, head, onAdd, remember }: { q: WidgetListQuery; version: number; head?: number; onAdd(item: WidgetListItem): void; remember(page: number, keys: string[]): void }) {
 const list = useWidgetList(q, version)
 const keys = list.items.map(item => item.key).join(',')
 useEffect(() => { remember(q.offset, keys ? keys.split(',') : []) }, [q.offset, keys, remember])
 return <><WidgetPayloadError error={list.payloadError}/>{list.items.map(item => <WidgetBrowseCard key={item.key} item={item} payload={list.payloads?.get(item.key) ?? (list.payloads ? null : undefined)} head={head} version={version} variant="explorer" onAdd={() => onAdd(item)}/>)}
  {showLoading({ loading: list.loading, data: list.total }) && <p role="status">Loading the index into your browser…</p>}{list.error && <p className="error" role="alert">{list.error}</p>}
 </>
}
function PendingCard({ item, write, version, onAdd }: { item: WidgetListItem; write: PendingWrite; version: number; onAdd(): void }) {
 return <article className={s.card}><header className={s.head}><h3>{item.name}</h3><ChartIcon type={item.chart}/></header><div className={s.body}><SyncChip write={write} version={version}/></div><footer className={s.foot}><a className={s.action} href={`/widgets/${item.key}`}>Open</a><button className={`${s.action} ${s.primary}`} onClick={onAdd}>+ Add to dashboard</button></footer></article>
}
function PendingSync({ write, version }: { write: PendingWrite; version: number }) {
 useSynced(write, version)
 return null
}
export function ExplorerGrid({ state, dispatch }: Props) {
 const auth = useDashAuth(), config = auth.config
 const { state: index, version } = useIndex()
 const pending = usePending()
 const q = explorerQuery(state, auth.status === 'authenticated' ? auth.address : undefined)
 const scope = JSON.stringify([q.search, q.chart, q.sort, q.user])
 const [seen, setSeen] = useState<{ scope: string; pages: Record<number, string[]> }>({ scope, pages: {} })
 const remember = useCallback((page: number, keys: string[]) => setSeen(previous => ({ scope, pages: { ...(previous.scope === scope ? previous.pages : {}), [page]: keys } })), [scope])
 const known = new Set(seen.scope === scope ? Object.entries(seen.pages).filter(([offset]) => Number(offset) < q.limit).flatMap(([, keys]) => keys) : [])
 const optimistic = mergeExplorerItems([], pending, state, q.user ?? undefined).filter(item => !known.has(item.key))
 const live = useTimedQuery(config?.enabled ? widgetCountSql(config.wallet, { search: '', chart: null, user: null }) : '', version, { skip: !config?.enabled })
 const filtered = useTimedQuery(config?.enabled ? widgetCountSql(config.wallet, q) : '', version, { skip: !config?.enabled })
 const [picker, setPicker] = useState<{ key: string; chart: ChartType } | null>(null)
 const [loginError, setLoginError] = useState<string>()
 const close = useCallback(() => setPicker(null), [])
 async function add(item: WidgetListItem) {
  setLoginError(undefined)
  try { if (auth.status === 'authenticated' || await auth.requestLogin()) setPicker(item) }
  catch { setLoginError("Login didn't finish. Try again.") }
 }
 if (!config) return <p>Loading the index into your browser…</p>
 if (!config.enabled) return <p>Dashboards are not enabled on this deployment.</p>
 return <><ExplorerView state={state} dispatch={dispatch} liveCount={live.data ? Number(live.data.rows[0]?.[0] ?? 0) : null}
  total={optimistic.length ? Math.max(optimistic.length, Number(filtered.data?.rows[0]?.[0] ?? 0)) : filtered.data ? Number(filtered.data.rows[0]?.[0] ?? 0) : null}
  loggedIn={auth.status === 'authenticated'} loading={showLoading({ loading: live.loading, data: live.data }) || showLoading({ loading: filtered.loading, data: filtered.data })} error={live.error ?? filtered.error ?? loginError ?? auth.error ?? undefined}>
  {optimistic.map(item => <PendingCard key={item.key} item={item} write={pending.find(p => p.key === item.key)!} version={version} onAdd={() => void add(item)}/>)}
  {Array.from({ length: state.pages }, (_, page) => <ResultsPage key={`${scope}:${page}`} q={{ ...q, limit: 12, offset: page * 12 }} version={version} head={index.liveHead} onAdd={item => void add(item)} remember={remember}/>)}
 </ExplorerView>{pending.filter(write => write.kind === 'widget' && !optimistic.some(item => item.key === write.key)).map(write => <PendingSync key={write.key} write={write} version={version}/>)}{picker && <AddToDashboardPicker widgetKey={picker.key} chart={picker.chart} onClose={close}/>}</>
}
