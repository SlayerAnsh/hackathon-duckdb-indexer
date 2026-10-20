'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '../ui/Dialog'
import { Field } from '../ui/Field'
import { useDashAuth } from '../auth/DashAuthProvider'
import { dashApi, DashApiError } from '../../lib/dash/api'
import { saveErrorMessage, withSession } from '../../lib/dash/auth-client'
import { addPending, usePending, useSynced, type PendingWrite } from '../../lib/dash/pending'
import { defaultSize, type ChartType } from '../../lib/dash/schema'
import { userDashboardsSql } from '../../lib/dash/sql'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import s from './widgets.module.css'

export type PickerRow = { key: string; title: string; widgets: number; added: boolean }
type Phase = 'adding' | 'done' | 'conflict'
export function pickerRows(rows: unknown[][], pending: PendingWrite[], widgetKey: string): PickerRow[] {
 const merged = new Map<string, PickerRow>(rows.map(r => [String(r[0]), { key: String(r[0]), title: String(r[1]), widgets: Number(r[2]), added: r[3] === true || r[3] === 1 }]))
 for (const p of pending) if (p.kind === 'dashboard') {
  if (p.op === 'delete') merged.delete(p.key)
  else if (!merged.has(p.key)) merged.set(p.key, { key: p.key, title: String(p.fields?.title ?? ''), widgets: 0, added: false })
  else if (p.fields?.title !== undefined) merged.get(p.key)!.title = String(p.fields.title)
 }
 for (const p of pending) if (p.kind === 'link' && p.op === 'upsert' && p.fields?.widget === widgetKey) {
  const row = merged.get(String(p.fields.dashboard))
  if (row) row.added = true
 }
 return [...merged.values()]
}
const PlusGlyph = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
const CheckGlyph = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>
function RowStatus({ row, phase }: { row: PickerRow; phase?: Phase }) {
 if (phase === 'adding') return <span className={s.pickStatus}><span className="spinner" aria-hidden="true"/>Adding…</span>
 if (phase === 'done') return <span className={`${s.pickStatus} ${s.pickDone}`}><CheckGlyph/>Added</span>
 if (row.added || phase === 'conflict') return <span className={s.pickStatus}>Already added</span>
 return <span className={s.pickAdd} aria-hidden="true"><PlusGlyph/></span>
}
export function PickerList({ rows, phase, onPick, onNew }: { rows: PickerRow[]; phase: Record<string, Phase>; onPick(key: string): void; onNew(): void }) {
 return <div className={s.pickList}>
  {rows.length > 0 && <ul className={s.pickRows}>{rows.map(row => <li key={row.key} className={s.pickRow} data-state={phase[row.key] ?? (row.added ? 'added' : 'idle')}>
   <button type="button" className={s.pickBtn} disabled={row.added || !!phase[row.key]} aria-label={row.added || phase[row.key] ? undefined : `Add to ${row.title || 'Untitled dashboard'}`} onClick={() => onPick(row.key)}>
    <span className={s.pickText}><strong>{row.title || 'Untitled dashboard'}</strong><small>{row.widgets} {row.widgets === 1 ? 'widget' : 'widgets'}</small></span>
    <RowStatus row={row} phase={phase[row.key]}/>
   </button>
   {phase[row.key] === 'done' && <Link className="btn btn-sm btn-quiet" href={`/d/${row.key}`}>View</Link>}
  </li>)}</ul>}
  <button type="button" className={`btn btn-quiet ${s.pickNew}`} onClick={onNew}><PlusGlyph/>New dashboard</button>
 </div>
}
function PendingSync({ write, version }: { write: PendingWrite; version: number }) { useSynced(write, version); return null }
export function AddToDashboardPicker({ widgetKey, chart, onClose }: { widgetKey: string; chart: ChartType; onClose(): void }) {
 const auth = useDashAuth(), config = auth.config
 const { version } = useIndex()
 const pending = usePending()
 const mine = pending.filter(p => !p.fields?.user || String(p.fields.user).toLowerCase() === auth.address?.toLowerCase())
 const query = useTimedQuery(config?.enabled && auth.address ? userDashboardsSql(config.wallet, auth.address, widgetKey) : 'SELECT NULL WHERE false', version)
 const rows = pickerRows(query.data?.rows ?? [], mine.filter(p => p.kind !== 'dashboard' || p.fields?.user !== undefined), widgetKey)
 const [phase, setPhase] = useState<Record<string, Phase>>({})
 const [creating, setCreating] = useState(false), [title, setTitle] = useState(''), [error, setError] = useState<string | null>(null)
 const [created, setCreated] = useState<string | null>(null), [submitting, setSubmitting] = useState<'row' | 'new' | null>(null)
 const busy = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null)
 useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
 async function add(dashboard?: string) {
  if (busy.current) return
  busy.current = true; setError(null); setSubmitting(dashboard ? 'row' : 'new')
  let key = dashboard ?? created
  try {
   if (!key) {
    const result = await withSession(() => dashApi.createDashboard({ title }), auth.requestLogin)
    if (!result.key) throw new Error('Missing dashboard key')
    key = result.key; setCreated(key)
    addPending({ key, kind: 'dashboard', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: { title, user: auth.address! } })
   }
   const target = key
   setPhase(p => ({ ...p, [target]: 'adding' }))
   const result = await withSession(() => dashApi.addLink(target, { widget: widgetKey, size: defaultSize(chart) }), auth.requestLogin)
   if (result.linkKey) addPending({ key: result.linkKey, kind: 'link', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash, fields: { dashboard: target, widget: widgetKey, user: auth.address! } })
   setPhase(p => ({ ...p, [target]: 'done' }))
   if (!dashboard) { setCreating(false); setTitle(''); setCreated(null) }
   timer.current = setTimeout(onClose, 2000)
  } catch (err) {
   if (key && err instanceof DashApiError && err.code === 'conflict' && err.status === 409) setPhase(p => ({ ...p, [key!]: 'conflict' }))
   else { if (key) setPhase(p => { const next = { ...p }; delete next[key!]; return next }); setError(saveErrorMessage(err)) }
  } finally { busy.current = false; setSubmitting(null) }
 }
 const adding = !!submitting || Object.values(phase).includes('adding')
 const loading = query.loading && !query.data
 const showForm = creating || (!loading && !query.error && rows.length === 0)
 const body = !config ? <p className={s.pickNote}>Loading the index into your browser…</p>
  : !config.enabled ? <p className={s.pickNote}>Dashboards are not enabled on this deployment.</p>
  : <>
   {mine.map(p => <PendingSync key={p.key} write={p} version={version}/>)}
   {loading ? <div className={s.pickSkel} role="status" aria-label="Loading your dashboards"><span className="skel"/><span className="skel"/><span className="skel"/></div>
    : query.error ? <div className="notice notice-bad" role="alert"><div><p className="notice-title">Could not load your dashboards</p><p>{query.error}</p></div></div>
    : rows.length === 0 ? <p className={s.pickNote}>You have no dashboards yet. Name one and this widget becomes its first tile.</p>
    : <PickerList rows={rows} phase={phase} onPick={key => void add(key)} onNew={() => setCreating(true)}/>}
   {showForm && <form className={s.pickForm} onSubmit={e => { e.preventDefault(); void add() }}>
    <Field label="New dashboard title"><input className="input" data-autofocus={creating || undefined} required maxLength={80} placeholder="For example Network health" value={title} onChange={e => setTitle(e.target.value)}/></Field>
    <button type="submit" className="btn btn-primary" disabled={!title.trim() || adding} aria-busy={adding || undefined}>{submitting === 'new' && <span className="spinner" aria-hidden="true"/>}Create and add</button>
   </form>}
   {error && <div className="notice notice-bad" role="alert"><div><p>{error}</p></div></div>}
  </>
 return <Dialog open onClose={onClose} size="sm" title="Add to dashboard" description="Pick one of your dashboards. The widget is added as a new tile." dismissible={!adding} className={s.picker}>{body}</Dialog>
}
