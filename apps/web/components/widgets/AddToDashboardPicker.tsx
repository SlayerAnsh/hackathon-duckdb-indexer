'use client'
import { useEffect, useRef, useState } from 'react'
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
export function PickerList({ rows, phase, onPick, onNew }: { rows: PickerRow[]; phase: Record<string, Phase>; onPick(key: string): void; onNew(): void }) {
 return <>{rows.map(row => <div className={s.pickerRow} key={row.key}>
  <button className="btn btn-quiet" disabled={row.added || !!phase[row.key]} onClick={() => onPick(row.key)}><span>{row.title} <small>{row.widgets} widgets</small></span><span>{phase[row.key] === 'adding' ? 'Adding…' : phase[row.key] === 'done' ? 'Added ✓' : row.added || phase[row.key] === 'conflict' ? 'Already added' : '+'}</span></button>
  {phase[row.key] === 'done' && <a href={`/d/${row.key}`}>View</a>}
 </div>)}<button className="btn btn-quiet" onClick={onNew}>+ New dashboard</button></>
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
 const [created, setCreated] = useState<string | null>(null)
 const busy = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null)
 const root = useRef<HTMLElement>(null)
 useEffect(() => {
  const trigger = document.activeElement as HTMLElement | null
  root.current?.focus()
  function key(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
  function outside(e: MouseEvent) { if (!root.current?.contains(e.target as Node)) onClose() }
  document.addEventListener('keydown', key); document.addEventListener('mousedown', outside)
  return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', outside); if (timer.current) clearTimeout(timer.current); trigger?.focus() }
 }, [onClose])
 async function add(dashboard?: string) {
  if (busy.current) return
  busy.current = true; setError(null)
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
   timer.current = setTimeout(onClose, 2000)
  } catch (err) {
   if (key && err instanceof DashApiError && err.code === 'conflict' && err.status === 409) setPhase(p => ({ ...p, [key!]: 'conflict' }))
   else { if (key) setPhase(p => { const next = { ...p }; delete next[key!]; return next }); setError(saveErrorMessage(err)) }
  } finally { busy.current = false }
 }
 if (!config) return <p>Loading the index into your browser…</p>
 if (!config.enabled) return <p>Dashboards are not enabled on this deployment.</p>
 return <section className={s.picker} ref={root} tabIndex={-1} role="dialog" aria-label="Add to dashboard">
  <h2>Add to dashboard</h2><button className="btn btn-quiet" onClick={onClose} aria-label="Close">×</button>
  {mine.map(p => <PendingSync key={p.key} write={p} version={version}/>)}
  {query.loading && !query.data && <p>Loading the index into your browser…</p>}
  {query.error && <p className="error">{query.error}</p>}
  <PickerList rows={rows} phase={phase} onPick={key => void add(key)} onNew={() => setCreating(true)}/>
  {creating && <form onSubmit={e => { e.preventDefault(); void add() }}><label>Dashboard title<input required maxLength={80} value={title} onChange={e => setTitle(e.target.value)}/></label><button className="btn btn-primary" disabled={!title.trim() || Object.values(phase).includes('adding')}>Create and add</button></form>}
  {error && <p className="error">{error}</p>}
 </section>
}
