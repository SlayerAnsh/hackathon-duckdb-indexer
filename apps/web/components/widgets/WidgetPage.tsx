'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { canExtendWidget, deleteWidgetDirect, walletErrorKind, walletErrorMessage, type DirectResult } from '../../lib/dash/widget-actions'
import { BalanceNotice, signDisabledReason } from './BalanceNotice'
import { WidgetOwnerActions } from './WidgetActionDialog'
import { useWalletBalance } from '../../lib/dash/use-balance'
import type { BalanceLevel } from '../../lib/dash/wallet'
import { useDashAuth } from '../auth/DashAuthProvider'
import type { WidgetEntity } from '../../lib/dash/entities'
import { initEditor } from '../../lib/dash/editor-state'
import { addPending, usePending } from '../../lib/dash/pending'
import { fetchWidget } from '../../lib/dash/read'
import { isEntityKey, type ChartType, type LifetimeDays, type WidgetPayload, type WriteResult } from '../../lib/dash/schema'
import { checkWidgetSql } from '../../lib/dash/sql-guard'
import { widgetUsageSql, widgetDashboardsSql, toUsedOn } from '../../lib/dash/sql'
import { createBrowserRpc } from '../../lib/rpc-browser'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery, type TimedResult } from '../../lib/use-query'
import { AddressLink } from '../dash/AddressLink'
import { DataTable } from '../dash/DataTable'
import { RunBadge } from '../dash/RunBadge'
import { playgroundHref } from '../dash/WidgetCard'
import { CHART_LABELS } from './ChartPicker'
import { ChartIcon } from './ChartIcon'
import { WidgetEditor } from './WidgetEditor'
import { WidgetPreview } from './WidgetPreview'
import { TimeLeft } from './TimeLeft'
import { ExtendButton } from './ExtendButton'
import { SyncChip } from './SyncChip'
import { AddToDashboardPicker } from './AddToDashboardPicker'
import { EmptyState } from './EmptyState'
import { rpcMessage } from '../RowActions'
import s from './widgets.module.css'

export type WidgetPageMode = 'loading' | 'missing' | 'owner' | 'viewer'
export function widgetPageMode({ loaded, widget, address, authStatus }: { loaded: boolean; widget: WidgetEntity | null; address?: string; authStatus?: string }): WidgetPageMode {
 return authStatus === 'loading' || !loaded ? 'loading' : !widget ? 'missing' : address?.toLowerCase() === widget.owner.toLowerCase() ? 'owner' : 'viewer'
}
/** A read failure. `limited` marks an RPC rate limit or exhausted query budget, which must not be retried automatically. */
export type WidgetLoadError = { message: string; limited: boolean }
export function widgetLoadError(error: unknown): WidgetLoadError {
 const message = rpcMessage(error)
 // rpcMessage swaps in its budget copy only for rate limit and quota errors.
 return { message: message.replace(/^\w*Error: /, ''), limited: message !== String(error) }
}
export function widgetLoadState({ authStatus, widget, pending, attempts, loadError, limited = false }: { authStatus: string; widget: unknown | null; pending: boolean; attempts: number; loadError: boolean; limited?: boolean }): 'auth' | 'syncing' | 'missing' | 'error' | 'ready' {
 if (authStatus === 'loading') return 'auth'
 if (widget) return 'ready'
 if (loadError && limited) return 'error'
 if (pending && attempts < 10) return 'syncing'
 if (loadError && attempts < 3) return 'syncing'
 if (loadError) return 'error'
 return 'missing'
}
const LOADING_COPY = 'Loading the index into your browser…'
const PlusGlyph = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
const LinkGlyph = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.7.7M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.7-.7"/></svg>
const CheckGlyph = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>
const ShieldGlyph = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M8 1.5 2.5 3.5V8c0 3.2 2.3 5.5 5.5 6.5 3.2-1 5.5-3.3 5.5-6.5V3.5Z"/></svg>
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
export function KeptLive() { return <span className="quiet-chip">Kept live</span> }
/** Placeholder with the real page's outline: title, facts line, chart frame and side panels. */
export function WidgetSkeleton({ label = LOADING_COPY }: { label?: string }) {
 return <div className={s.page} aria-busy="true">
  <div className={s.head} aria-hidden="true"><span className={`skel ${s.skCrumb}`}/><span className={`skel ${s.skTitle}`}/><span className={`skel ${s.skFacts}`}/></div>
  <div className={s.columns} aria-hidden="true"><div className={`card ${s.skFrame}`}><span className="skel-block"/><span className="skel-line skel-w70"/><span className="skel-line skel-w40"/></div><div className={s.aside}><div className={`card ${s.skPanel}`}/><div className={`card ${s.skPanel}`}/></div></div>
  <span className="sr-only" role="status">{label}</span>
 </div>
}
export function WidgetPageBody({ state, name, error, onRetry }: { state: ReturnType<typeof widgetLoadState>; name?: string; error?: WidgetLoadError | null; onRetry?(): void }) {
 if (state === 'auth') return <WidgetSkeleton/>
 if (state === 'syncing') return <div className={s.page}>
  <header className={s.head}><div className={s.titleRow}><div className={s.titleBlock}><h1>{name || 'New widget'}</h1><span className="state state-disk">Syncing</span></div></div></header>
  <div className="notice notice-info" role="status" aria-live="polite"><span className={`spinner ${s.noticeSpin}`} aria-hidden="true"/><div><p>Saved to Arkiv. The index catches up in a few seconds.</p></div></div>
  <div className={`card ${s.skFrame}`} aria-hidden="true"><span className="skel-block"/><span className="skel-line skel-w70"/><span className="skel-line skel-w40"/></div>
 </div>
 if (state === 'error' && error?.limited) return <div className={s.state}><div className="notice notice-warn" role="alert">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 1.75 14.5 13.5h-13Z"/><path d="M8 6.25V9M8 11.25h.01"/></svg>
  <div><p className="notice-title">{error.message}</p><p>The public Arkiv RPC limits how many reads this browser can make. The widget is still on Arkiv; it loads again once the budget resets.</p>
   {onRetry && <div className="notice-actions"><button type="button" className="btn btn-sm" onClick={onRetry}>Try again</button><Link className="btn btn-sm btn-quiet" href="/explore?tab=widgets">Browse widgets</Link></div>}</div>
 </div></div>
 if (state === 'error') return <div className={s.state}><EmptyState icon="widget" title="Could not load this widget" body="The Arkiv RPC did not answer after a few tries. The widget may still exist; try again in a moment." actions={<>{onRetry && <button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>}<Link className="btn btn-quiet" href="/explore?tab=widgets">Browse widgets</Link></>}/>{error && <p className={s.errorDetail}>{error.message}</p>}</div>
 if (state === 'missing') return <MissingWidget/>
 return null
}
export function MissingWidget() {
 return <div className={s.state}><EmptyState icon="widget" title="Widget not found" body="This widget has expired. Its query is no longer on Arkiv." actions={<><Link className="btn btn-primary" href="/explore?tab=widgets">Browse widgets</Link><Link className="btn btn-quiet" href="/widgets/new">New widget</Link></>}/></div>
}
export function DisabledNotice() {
 return <div className={s.state}><EmptyState icon="widget" title="Dashboards are off" body="Dashboards are not enabled on this deployment." actions={<Link className="btn btn-quiet" href="/playground">Open playground</Link>}/></div>
}
export function ViewerHeader({ name, sql, onAdd }: { name: string; sql: string; onAdd(): void }) {
 return <header className={s.head}><div className={s.titleRow}><div className={s.titleBlock}><h1>{name}</h1></div><div className={s.actions}><Link className="btn btn-outline" href={playgroundHref(sql)}>Open in playground</Link><button type="button" className="btn btn-primary" onClick={onAdd}><PlusGlyph/>Add to my dashboard</button></div></div></header>
}
async function copyText(text: string, done: () => void) {
 try { await navigator.clipboard.writeText(text); done() } catch { /* Keep the action available for retry. */ }
}
function useCopied(): [boolean, () => void] {
 const [copied, setCopied] = useState(false)
 useEffect(() => { if (copied) { const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer) } }, [copied])
 return [copied, () => setCopied(true)]
}
export function WidgetHeader({ name, chart, user, official, uses, expiresAt, head, ms, widgetKey, sql, canAdd, onAdd }: {
 name: string; chart: ChartType; user: string; official: boolean; uses: number; expiresAt: number; head?: number; ms?: number; widgetKey: string; sql: string; canAdd: boolean; onAdd?(): void
}) {
 const [copied, markCopied] = useCopied()
 return <header className={s.head}>
  <nav className={s.crumbs} aria-label="Breadcrumb"><Link href="/explore">Explore</Link><span aria-hidden="true">/</span><Link href="/explore?tab=widgets">Widgets</Link><span aria-hidden="true">/</span><span aria-current="page">{name}</span></nav>
  <div className={s.titleRow}>
   <div className={s.titleBlock}><h1>{name}</h1><span className="chip"><ChartIcon type={chart}/>{CHART_LABELS[chart]}</span></div>
   <div className={s.actions}>
    <button type="button" className="btn btn-quiet" onClick={() => void copyText(`${location.origin}/widgets/${widgetKey}`, markCopied)}>{copied ? <CheckGlyph/> : <LinkGlyph/>}{copied ? 'Link copied' : 'Copy link'}</button>
    <span className="sr-only" aria-live="polite">{copied ? 'Link copied' : ''}</span>
    <Link className="btn btn-outline" href={playgroundHref(sql)}>Open in playground</Link>
    {canAdd && <button type="button" className="btn btn-primary" onClick={onAdd}><PlusGlyph/>Add to dashboard</button>}
   </div>
  </div>
  <div className={s.facts}>
   <span className={s.by}>by {official ? <><span className="chip chip-official"><ShieldGlyph/>Featured</span><span>Arkiv SQL Indexer</span></> : <AddressLink address={user}/>}</span>
   <span>on {plural(uses, 'dashboard')}</span>
   <span>{official ? <KeptLive/> : <TimeLeft expiresAt={expiresAt} head={head}/>}</span>
   <span className={s.live}><i aria-hidden="true"/>Live, computed in your browser</span>
   {ms !== undefined && <span><RunBadge ms={ms}/></span>}
  </div>
 </header>
}
export function UsedOnPanel({ items, total, expanded = false }: { items: ReturnType<typeof toUsedOn>; total: number; expanded?: boolean }) {
 const [open, setOpen] = useState(expanded)
 return <section className={`card ${s.panel}`}>
  <div className="card-h"><h2>Used on {plural(total, 'dashboard')}</h2></div>
  {items.length === 0 ? <p className={s.panelEmpty}>Not on any dashboard yet. Add it to one of yours and it shows up here.</p>
   : <ul className={s.uses}>{(open ? items : items.slice(0, 4)).map(item => <li key={item.key}><Link className={s.useLink} href={`/d/${item.key}`}><span className={s.useText}><strong>{item.title}</strong><small>{plural(item.widgets, 'widget')}</small></span>{item.official && <span className="chip chip-official"><ShieldGlyph/>Featured</span>}</Link></li>)}</ul>}
  {!open && total > 4 && <div className={s.panelFoot}><button type="button" className="btn btn-quiet btn-sm" aria-expanded={false} onClick={() => setOpen(true)}>Show all {total}</button></div>}
 </section>
}
export function LifetimePanel({ official, owner, expiresAt, head, lifetimeDays, widgetKey, name = 'widget', canExtend, reason, balance, address, onExtended, onDeleted, onTransferred, onSigned }: {
 official: boolean; owner: boolean; expiresAt: number; head?: number; lifetimeDays: LifetimeDays; widgetKey: string; name?: string; canExtend: boolean; reason?: string; balance?: { wei: bigint | null; level: BalanceLevel }; address?: string; onExtended?(result: WriteResult): void; onDeleted?(r: DirectResult): void; onTransferred?(r: DirectResult, to: string): void; onSigned?(): void
}) {
 const live = head === undefined || expiresAt > head
 const disabledReason = signDisabledReason(balance?.level ?? 'unknown')
 return <section className={`card ${s.panel}`}>
  <div className="card-h"><h2>Lifetime</h2>{official ? <KeptLive/> : <TimeLeft expiresAt={expiresAt} head={head}/>}</div>
  <div className={s.panelBody}>
   <dl className={s.meta}>
    {!official && <div><dt>Renewal</dt><dd>Lives for {lifetimeDays} days per extend</dd></div>}
    <div><dt>Entity key</dt><dd className={s.entityKey}>{widgetKey}</dd></div>
   </dl>
   {!official && live && <>
    {address && balance && <BalanceNotice address={address} {...balance}/>}
    {(canExtend || (owner && address)) && <div className={s.lifeActions}>
     {canExtend && <ExtendButton widgetKey={widgetKey} expiresAt={expiresAt} head={head} lifetimeDays={lifetimeDays} canExtend={canExtend} label={`Extend by ${lifetimeDays} days`} disabledReason={disabledReason} onExtended={onExtended} onSigned={onSigned}/>}
     {owner && address && <div className={s.ownerRow}><WidgetOwnerActions widgetKey={widgetKey} name={name} address={address} transfer disabledReason={disabledReason} onDeleted={onDeleted} onTransferred={onTransferred} onSigned={onSigned}/></div>}
    </div>}
    <p className={s.panelHint}>{reason ?? (canExtend ? 'Anyone can extend this widget. Your wallet signs and pays a small network fee.' : 'Log in to extend this widget.')}</p>
   </>}
  </div>
 </section>
}
export function NewVersionNotice({ oldKey, busy, disabled, disabledReason, error, onDelete }: { oldKey: string; busy: boolean; disabled: boolean; disabledReason?: string; error: string | null; onDelete(): void }) {
 return <div className="notice notice-ok" role="status">
  <CheckGlyph/>
  <div>
   <p>Saved as a new version. Your dashboards now use it. The old version stays until it expires, because other dashboards may still use it.</p>
   {error && <p className={s.noticeError} role="alert">{error}</p>}
   <div className="notice-actions"><button type="button" className="btn btn-sm" data-old-key={oldKey} title={disabledReason} disabled={disabled || busy} aria-busy={busy || undefined} onClick={onDelete}>{busy && <span className="spinner" aria-hidden="true"/>}{busy ? 'Waiting for wallet…' : 'Delete old version'}</button></div>
  </div>
 </div>
}
type Runner = (sql: string, version: number, control: { maxRows: number }) => TimedResult
function StoredQuery({ payload, version, run, onTiming }: { payload: WidgetPayload; version: number; run: Runner; onTiming?(ms?: number): void }) {
 const query = run(payload.sql, version, { maxRows: 5000 })
 const [table, setTable] = useState(false), [copied, markCopied] = useCopied()
 useEffect(() => { onTiming?.(query.ms) }, [query.ms, onTiming])
 const waiting = !query.data && !query.error
 return <div className={s.main}>
  <section className={`card ${s.frame}`} aria-label="Widget preview">
   <div className="card-h"><h2>Preview</h2>{query.data && <span className={s.rows}>{plural(query.data.rows.length, 'row')}</span>}<span className={s.spacer}/><div className="seg seg-sm" role="group" aria-label="Preview view"><button type="button" aria-pressed={!table} onClick={() => setTable(false)}>Chart</button><button type="button" aria-pressed={table} onClick={() => setTable(true)}>Table</button></div></div>
   <div className={table ? s.tableBody : s.chartBody}>
    {query.error ? <div className="notice notice-bad" role="status"><div><p className="notice-title">Preview unavailable</p><p className={s.mono}>{query.error}</p></div></div>
     : waiting ? <div className={s.skel} role="status" aria-label={LOADING_COPY}><span className="skel-block"/><span className="skel-line skel-w70"/><span className="skel-line skel-w40"/></div>
     : table ? <DataTable data={query.data!}/> : <WidgetPreview id="saved-widget-preview" payload={payload} query={query}/>}
   </div>
  </section>
  <section className={`card ${s.sqlCard}`} aria-label="SQL">
   <div className="card-h"><h2>SQL</h2><button type="button" className="btn btn-quiet btn-sm" onClick={() => void copyText(payload.sql, markCopied)}>{copied ? <CheckGlyph/> : null}{copied ? 'SQL copied' : 'Copy SQL'}</button><span className="sr-only" aria-live="polite">{copied ? 'SQL copied' : ''}</span></div>
   <pre className={s.sql} tabIndex={0}><code>{payload.sql}</code></pre>
  </section>
 </div>
}
export function StoredWidgetPreview({ payload, version, run = useTimedQuery, onTiming }: { payload: WidgetPayload; version: number; run?: Runner; onTiming?(ms?: number): void }) {
 const reason = checkWidgetSql(payload.sql)
 if (reason) return <div className={s.main}><div className="notice notice-bad" role="alert"><div><p className="notice-title">This widget's SQL cannot run</p><p>{reason}</p></div></div><section className={`card ${s.sqlCard}`} aria-label="SQL"><div className="card-h"><h2>SQL</h2></div><pre className={s.sql} tabIndex={0}><code>{payload.sql}</code></pre></section></div>
 return <StoredQuery payload={payload} version={version} run={run} onTiming={onTiming}/>
}
export function WidgetPage({ widgetKey }: { widgetKey: string }) {
 const router = useRouter()
 const key = widgetKey.toLowerCase(), auth = useDashAuth(), config = auth.config
 const balance = useWalletBalance(auth.address, config?.rpcUrl)
 const { version, state } = useIndex()
 const [replaced, setReplaced] = useState<string | null>(null)
 const [oldWidget, setOldWidget] = useState<WidgetEntity | null>(null)
 const [deletingOld, setDeletingOld] = useState(false)
 const [deleteError, setDeleteError] = useState<string | null>(null)
 const deleteBusy = useRef(false)
 useEffect(() => {
  const value = new URLSearchParams(window.location.search).get('replaced')
  setReplaced(value && isEntityKey(value) && value.toLowerCase() !== key ? value.toLowerCase() : null)
  setOldWidget(null); setDeleteError(null)
 }, [key])
 useEffect(() => {
  let active = true
  setOldWidget(null)
  if (replaced && config?.enabled && auth.address) void fetchWidget(createBrowserRpc(config.rpcUrl), config.wallet, replaced).then(result => {
   if (active && result.widget && result.widget.expiresAt > result.head && result.widget.owner === auth.address?.toLowerCase()) setOldWidget(result.widget)
  }).catch(() => {})
  return () => { active = false }
 }, [replaced, config?.enabled, config?.wallet, config?.rpcUrl, auth.address])
 async function deleteOld() {
  if (signDisabledReason(balance.level) || !oldWidget || deleteBusy.current || oldWidget.owner !== auth.address?.toLowerCase()) return
  deleteBusy.current = true; setDeletingOld(true); setDeleteError(null)
  try {
   const result = await auth.sign(c => deleteWidgetDirect(c, oldWidget.key))
   addPending({ key: oldWidget.key, kind: 'widget', op: 'delete', afterBlock: result.afterBlock, txHash: result.txHash })
   setOldWidget(null)
  } catch (error) { setDeleteError(walletErrorMessage(walletErrorKind(error))) }
  finally { deleteBusy.current = false; setDeletingOld(false); balance.refresh() }
 }

 const [record, setRecord] = useState<{ key: string; widget: WidgetEntity | null; head: number } | null>(null)
 const [loadError, setLoadError] = useState<WidgetLoadError | null>(null)
 const [refresh, setRefresh] = useState(0), [editorRevision, setEditorRevision] = useState(0)
 const [attemptState, setAttemptState] = useState({ key, count: 0 })
 const attempts = attemptState.key === key ? attemptState.count : 0
 const [ms, setMs] = useState<number | undefined>(undefined)
 const [picker, setPicker] = useState(false)
 const closePicker = useCallback(() => setPicker(false), [])
 const latestLocal = useRef<{ key: string; txHash: string; afterBlock: number; updatedAt?: number } | null>(null)
 const sequence = useRef(0)
 const pending = usePending()
 const write = pending.find(p => p.key === key && p.kind === 'widget' && p.op === 'upsert')
 const storedWidget = record?.key === key ? record.widget : null
 const widget = storedWidget && typeof write?.fields?.owner === 'string' ? { ...storedWidget, owner: write.fields.owner } : storedWidget
 const loadState = widgetLoadState({ authStatus: auth.status, widget, pending: !!write, attempts, loadError: !!loadError, limited: !!loadError?.limited })
 const usage = useTimedQuery(config?.enabled && isEntityKey(key) ? widgetUsageSql(config.wallet, key, auth.address ?? null) : 'SELECT 0, false', version)
 const usedOn = useTimedQuery(config?.enabled && isEntityKey(key) ? widgetDashboardsSql(config.wallet, key, Number.MAX_SAFE_INTEGER) : 'SELECT NULL WHERE false', version)
 useEffect(() => {
  const current = ++sequence.current
  setLoadError(null)
  if (!config?.enabled) return
  if (!isEntityKey(key)) { setRecord({ key, widget: null, head: 0 }); return }
  void fetchWidget(createBrowserRpc(config.rpcUrl), config.wallet, key).then(result => {
   if (sequence.current !== current) return
   setRecord(previous => {
    // An RPC replica may lag behind a successful local write.
    localTxSeen(result.widget)
    const local = latestLocal.current
    if (previous?.key === key && previous.widget && local?.key === key && (!result.widget || result.widget.updatedAt <= local.afterBlock)) return previous
    if (previous?.key === key && previous.widget && result.widget && result.widget.updatedAt < previous.widget.updatedAt) return previous
    return { key, ...result }
   })
  }).catch(error => { if (sequence.current === current) setLoadError(widgetLoadError(error)) })
  return () => { sequence.current++ }
 }, [key, config?.enabled, config?.wallet, config?.rpcUrl, refresh])
 useEffect(() => {
  if (loadState !== 'syncing' || !config?.enabled) return
  const timer = setTimeout(() => {
   setAttemptState(previous => ({ key, count: (previous.key === key ? previous.count : 0) + 1 }))
   setRefresh(n => n + 1)
  }, 2000)
  return () => clearTimeout(timer)
 }, [loadState, key, config?.enabled, refresh])
 function localTxSeen(value: WidgetEntity | null) {
  const local = latestLocal.current
  if (local?.key === key && local.updatedAt === undefined && value && value.updatedAt > local.afterBlock) local.updatedAt = value.updatedAt
 }
 function written(result: WriteResult, payload?: WidgetPayload) {
  if (result.key && result.key !== key && isEntityKey(result.key)) { router.push('/widgets/' + result.key + '?replaced=' + key); return }
  sequence.current++
  latestLocal.current = { key, txHash: result.txHash, afterBlock: result.afterBlock }
  setRecord(previous => previous?.key === key && previous.widget ? { ...previous, widget: { ...previous.widget, ...(payload ? { widget: payload, name: payload.name, chart: payload.chart } : {}), expiresAt: result.expiresAt ?? previous.widget.expiresAt } } : previous)
  if (payload) setEditorRevision(n => n + 1)
  setRefresh(n => n + 1)
 }
 function deleted(result: DirectResult) {
  addPending({ key, kind: 'widget', op: 'delete', afterBlock: result.afterBlock, txHash: result.txHash })
  router.push('/me')
 }
 function transferred(result: DirectResult, to: string) {
  const owner = to.toLowerCase()
  addPending({ key, kind: 'widget', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: { owner } })
  written(result)
  setRecord(previous => previous?.key === key && previous.widget ? { ...previous, widget: { ...previous.widget, owner } } : previous)
 }
 function retry() {
  setAttemptState({ key, count: 0 })
  setRefresh(n => n + 1)
 }
 async function openPicker() {
  if (auth.status !== 'authenticated' && !await auth.requestLogin()) return
  setPicker(true)
 }
 const mode = widgetPageMode({ loaded: record?.key === key, widget, address: auth.address, authStatus: auth.status })
 if (!config) return <WidgetSkeleton/>
 if (!config.enabled) return <DisabledNotice/>
 // Nothing read for this key yet: show the outline, never the expired copy.
 if (loadState === 'missing' && record?.key !== key && isEntityKey(key)) return <WidgetSkeleton/>
 if (loadState !== 'ready') return <WidgetPageBody state={loadState} name={write?.fields?.name === undefined ? undefined : String(write.fields.name)} error={loadError} onRetry={retry}/>
 if (mode === 'loading') return <WidgetSkeleton/>
 const head = Math.max(record?.head ?? 0, state.liveHead ?? 0)
 if (!widget) return <MissingWidget/>
 const name = String(write?.fields?.name ?? widget.widget.name)
 const expiresAt = Math.max(widget.expiresAt, Number(write?.fields?.expiresAt ?? widget.expiresAt))
 if (expiresAt <= head) return <MissingWidget/>
 const official = widget.official
 const owner = mode === 'owner' && !official
 const uses = Number(usage.data?.rows[0]?.[0] ?? 0)
 const panels = <>
  <UsedOnPanel key={`used:${key}`} items={toUsedOn(usedOn.data?.rows ?? [], config.wallet)} total={uses}/>
  <LifetimePanel key={`life:${key}`} name={name} owner={owner} balance={balance} address={auth.address} onSigned={balance.refresh} onDeleted={deleted} onTransferred={transferred} official={official} expiresAt={expiresAt} head={head} lifetimeDays={widget.widget.lifetimeDays} widgetKey={key} canExtend={canExtendWidget({ ...widget, expiresAt }, head, auth.address ?? null, config.wallet)} onExtended={written}/>
 </>
 return <div className={s.page}>
  <WidgetHeader name={name} chart={widget.chart} user={widget.user} official={official} uses={uses} expiresAt={expiresAt} head={head} ms={ms} widgetKey={key} sql={widget.widget.sql} canAdd onAdd={() => void openPicker()}/>
  {write && <div className={s.sync}><SyncChip write={write} version={version}/></div>}
  {oldWidget && oldWidget.owner === auth.address?.toLowerCase() && <NewVersionNotice oldKey={oldWidget.key} busy={deletingOld} disabled={!!signDisabledReason(balance.level)} disabledReason={signDisabledReason(balance.level)} error={deleteError} onDelete={() => void deleteOld()}/>}
  {auth.error && <div className="notice notice-bad" role="alert"><div><p>{auth.error}</p></div></div>}
  {owner ? <>
   <WidgetEditor key={`${key}:${editorRevision}`} mode="edit" widgetKey={key} initial={initEditor({ ...widget.widget, name })} onSaved={written}/>
   <div className={s.ownerPanels}>{panels}</div>
  </> : <div className={s.columns}>
   <StoredWidgetPreview key={key} payload={widget.widget} version={version} onTiming={setMs}/>
   <aside className={s.aside} aria-label="Widget details">{panels}</aside>
  </div>}
  {picker && auth.status === 'authenticated' && <AddToDashboardPicker widgetKey={key} chart={widget.widget.chart} onClose={closePicker}/>}
 </div>
}
