'use client'
import Link from 'next/link'
import { isOfficialOwned } from '../../lib/dash/official'
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
import { WidgetBrowseCard, WidgetCardBody, WidgetCardFoot } from './WidgetBrowseCard'
import { AddToDashboardPicker } from './AddToDashboardPicker'
import { ChartIcon } from './ChartIcon'
import { CHART_LABELS } from './ChartPicker'
import { SyncChip } from './SyncChip'
import { EmptyState, PlusIcon, SkeletonCards } from './EmptyState'
import { CountLine, PrimaryLabel, SearchField, ToggleChip, Toolbar, ToolbarSelect } from '../explore/Toolbar'
import { useIndexedPendingKeys } from '../explore/useIndexedPendingKeys'
import e from '../explore/explore.module.css'

type Props = { state: ExplorerState; dispatch(a: Parameters<typeof explorerReducer>[1]): void }
export function ExplorerView({ state, dispatch, liveCount, total, loggedIn, loading, children, error }: Props & {
 liveCount: number | null; total: number | null; loggedIn: boolean; loading: boolean; children?: ReactNode; error?: string
}) {
 const [search, setSearch] = useState(state.search)
 useEffect(() => { setSearch(state.search) }, [state.search])
 const debouncedSearch = useDebounced(search)
 useEffect(() => { if (debouncedSearch !== state.search) dispatch({ type: 'search', value: debouncedSearch }) }, [debouncedSearch, state.search, dispatch])
 const filtered = !!state.search || state.chart !== null || state.mine
 const empty = !loading && !error && total === 0
 const clear = () => { setSearch(''); dispatch({ type: 'clear' }) }
 return <section className={e.browse}>
  <Toolbar count={total ? <CountLine text={`${total.toLocaleString('en-US')} ${total === 1 ? 'widget' : 'widgets'}`}/> : null} filters={<>
   <div className="seg" role="group" aria-label="Chart type">{([null, ...CHART_TYPES] as const).map(chart => <button type="button" key={chart ?? 'all'} aria-pressed={state.chart === chart} onClick={() => dispatch({ type: 'chart', value: chart })}>{chart && <ChartIcon type={chart}/>}{chart ? CHART_LABELS[chart] : 'All charts'}</button>)}</div>
   <ToolbarSelect className={e.typeSelect} aria-label="Chart type" value={state.chart ?? ''} onChange={ev => dispatch({ type: 'chart', value: (ev.target.value || null) as ChartType | null })}><option value="">All charts</option>{CHART_TYPES.map(chart => <option key={chart} value={chart}>{CHART_LABELS[chart]}</option>)}</ToolbarSelect>
  </>}>
   <SearchField label="Search by name or creator address" value={search} onChange={setSearch}/>
   <ToolbarSelect aria-label="Sort widgets" value={state.sort} onChange={ev => dispatch({ type: 'sort', value: ev.target.value as ExplorerState['sort'] })}><option value="newest">Newest</option><option value="used">Most used</option><option value="expiring">Expiring soon</option></ToolbarSelect>
   {loggedIn && <ToggleChip label="Mine only" checked={state.mine} onChange={value => dispatch({ type: 'mine', value })}/>}
   <Link className={`btn btn-primary ${e.primary}`} href="/widgets/new"><PlusIcon/><PrimaryLabel>New widget</PrimaryLabel></Link>
  </Toolbar>
  {error && <p className="error" role="alert">{error}</p>}
  {empty ? (liveCount === 0 && !filtered
   ? <EmptyState icon="widget" title="No widgets yet" body="A widget is one SQL query with a chart. Write one in a minute; it runs on the live index in your browser." actions={<><Link className="btn btn-primary" href="/widgets/new"><PlusIcon/>New widget</Link><Link className="btn btn-quiet" href="/playground">Open playground</Link></>}/>
   : <EmptyState icon="search" title="No matches" body={state.search ? `Nothing matches “${state.search}”.` : 'Nothing matches these filters.'} actions={<button type="button" className="btn btn-outline" onClick={clear}>Clear filters</button>}/>)
  : <div className={e.widgetGrid} aria-busy={loading}>{loading && !children ? <SkeletonCards count={4} tall label="Loading widgets…"/> : children}</div>}
  {total !== null && state.pages * 12 < total && <button type="button" className={`btn btn-outline ${e.more}`} onClick={() => dispatch({ type: 'more' })}>Load 12 more</button>}
 </section>
}
function ResultsPage({ q, version, head, onAdd, remember }: { q: WidgetListQuery; version: number; head?: number; onAdd(item: WidgetListItem): void; remember(page: number, keys: string[]): void }) {
 const list = useWidgetList(q, version)
 const { config } = useDashAuth()
 const keys = list.items.map(item => item.key).join(',')
 useEffect(() => { remember(q.offset, keys ? keys.split(',') : []) }, [q.offset, keys, remember])
 return <><WidgetPayloadError error={list.payloadError}/>{list.items.map(item => <WidgetBrowseCard key={item.key} item={item} payload={list.payloads?.get(item.key) ?? (list.payloads ? null : undefined)} head={head} version={version} variant="explorer" official={isOfficialOwned(item.user, item.owner, config?.wallet ?? '')} onAdd={() => onAdd(item)}/>)}
  {showLoading({ loading: list.loading, data: list.total }) && <SkeletonCards count={2} tall label="Loading widgets…"/>}{list.error && <p className="error" role="alert">{list.error}</p>}
 </>
}
/** A widget saved on Arkiv that the index does not list yet. Same layout as the indexed card, with a placeholder preview and the Syncing chip. */
export function PendingCard({ item, write, version, onAdd, official = false }: { item: WidgetListItem; write: PendingWrite; version: number; onAdd(): void; official?: boolean }) {
 return <article className={`${e.card} ${e.widget}`} style={{ '--lg': 4, '--md': 6, '--sm': 12 } as React.CSSProperties}>
  <div className={e.preview} style={{ height: 160 }}><span className={e.previewNote}><ChartIcon type={item.chart} size={24}/>Preview appears once indexed</span></div>
  <WidgetCardBody item={item} official={official} href={`/widgets/${item.key}`} lifetime={null}><div className={e.syncRow}><SyncChip write={write} version={version}/></div></WidgetCardBody>
  <WidgetCardFoot href={`/widgets/${item.key}`} onAdd={onAdd}/>
 </article>
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
 const indexed = useIndexedPendingKeys(pending, version)
 const [picker, setPicker] = useState<{ key: string; chart: ChartType } | null>(null)
 const [loginError, setLoginError] = useState<string>()
 const close = useCallback(() => setPicker(null), [])
 async function add(item: WidgetListItem) {
  setLoginError(undefined)
  try { if (auth.status === 'authenticated' || await auth.requestLogin()) setPicker(item) }
  catch { setLoginError("Login didn't finish. Try again.") }
 }
 if (!config) return <section className={e.browse}><div className={e.widgetGrid}><SkeletonCards count={2} tall label="Loading widgets…"/></div></section>
 if (!config.enabled) return <p className={`notice notice-info ${e.disabled}`}>Dashboards are not enabled on this deployment.</p>
 return <><ExplorerView state={state} dispatch={dispatch} liveCount={live.data ? Number(live.data.rows[0]?.[0] ?? 0) : null}
  total={filtered.data ? Number(filtered.data.rows[0]?.[0] ?? 0) + optimistic.filter(item => !indexed?.has(item.key)).length : optimistic.length || null}
  loggedIn={auth.status === 'authenticated'} loading={showLoading({ loading: live.loading, data: live.data }) || showLoading({ loading: filtered.loading, data: filtered.data })} error={live.error ?? filtered.error ?? loginError ?? auth.error ?? undefined}>
  {optimistic.map(item => <PendingCard key={item.key} item={item} write={pending.find(p => p.key === item.key)!} version={version} official={isOfficialOwned(item.user, item.owner, config.wallet)} onAdd={() => void add(item)}/>)}
  {Array.from({ length: state.pages }, (_, page) => <ResultsPage key={`${scope}:${page}`} q={{ ...q, limit: 12, offset: page * 12 }} version={version} head={index.liveHead} onAdd={item => void add(item)} remember={remember}/>)}
 </ExplorerView>{pending.filter(write => write.kind === 'widget' && !optimistic.some(item => item.key === write.key)).map(write => <PendingSync key={write.key} write={write} version={version}/>)}{picker && <AddToDashboardPicker widgetKey={picker.key} chart={picker.chart} onClose={close}/>}</>
}
