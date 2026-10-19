'use client'
import { useEffect, useReducer, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDashAuth, type DashAuth } from '../auth/DashAuthProvider'
import { useDashboard, type DashboardData } from '../../lib/dash/use-dashboard'
import { dashboardSlots } from '../../lib/dash/slots'
import { announcement, draftFromDashboard, isDirty, onDashboard, organizeReducer, remainingSlots, toOrganizeInput, type DraftItem, type OrganizeDraft } from '../../lib/dash/organize-state'
import { dashApi } from '../../lib/dash/api'
import { saveErrorMessage, withSession } from '../../lib/dash/auth-client'
import { addPending } from '../../lib/dash/pending'
import { useIndex } from '../../lib/use-index'
import { LoginGate } from './LoginGate'
import { MissingDashboard } from './DashboardView'
import { ImportModal } from './ImportModal'
import { LayoutPreview } from './LayoutPreview'
import { OrganizeRow } from './OrganizeRow'
import s from './organize.module.css'

export type OrganizeAccess = 'loading' | 'login' | 'not_owner' | 'missing' | 'owner'
export function organizeAccess({ auth, address, data }: { auth: DashAuth['status']; address?: string; data: DashboardData }): OrganizeAccess {
 if (auth === 'loading' || data.status === 'loading') return 'loading'
 if (auth !== 'authenticated') return 'login'
 if (data.status === 'missing' || !data.dashboard) return 'missing'
 return address?.toLowerCase() === data.dashboard.user.toLowerCase() ? 'owner' : 'not_owner'
}
export function leaveGuard(dirty: boolean, confirm: (message: string) => boolean): boolean {
 return !dirty || confirm('Leave without saving your changes?')
}
export function NotOwner({ dashboardKey }: { dashboardKey: string }) {
 return <section><p>Only the owner can organize this dashboard.</p><Link href={'/d/' + dashboardKey}>View dashboard</Link></section>
}
function SortableRow({ item, index, count, head, importedUser, dispatch, saving }: {
 item: DraftItem; index: number; count: number; head?: number; importedUser?: string; dispatch: React.Dispatch<Parameters<typeof organizeReducer>[1]>; saving: boolean
}) {
 const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging, isOver } = useSortable({ id: item.id, disabled: item.expired || saving })
 return <div ref={setNodeRef} className={isDragging ? s.dragging : isOver ? s.over : undefined} style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}>
  <OrganizeRow item={item} index={index} count={count} head={head} importedUser={importedUser}
   onResize={size => dispatch({ type: 'resize', id: item.id, size })} onRemove={() => dispatch({ type: 'remove', id: item.id })}
   dragHandle={<button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} className={s.handle} aria-label={`Reorder ${item.name}`} disabled={item.expired || saving}>⋮⋮</button>}/>
 </div>
}
function Editor({ dashboardKey, data, original }: { dashboardKey: string; data: DashboardData; original: OrganizeDraft }) {
 const auth = useDashAuth(), router = useRouter()
 const [draft, dispatch] = useReducer(organizeReducer, original)
 const [importOpen, setImportOpen] = useState(false)
 const [tab, setTab] = useState<'order' | 'preview'>('order')
 const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null)
 const busy = useRef(false), leaving = useRef(false)
 const importedUsers = useRef(new Map<string, string>())
 const dirty = isDirty(draft, original)
 const { state } = useIndex()
 const head = Math.max(data.head ?? 0, state.liveHead ?? 0)
 const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
 useEffect(() => { setImportOpen(new URLSearchParams(window.location.search).get('import') === '1') }, [])
 useEffect(() => {
  if (!draft.items.some(item => item.flash)) return
  const timer = setTimeout(() => dispatch({ type: 'clearFlash' }), 1200)
  return () => clearTimeout(timer)
 }, [draft.items])
 useEffect(() => {
  if (!dirty) return
  function beforeUnload(event: BeforeUnloadEvent) {
   if (leaving.current) return
   event.preventDefault(); event.returnValue = ''
  }
  function click(event: MouseEvent) {
   const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
   if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
   if (!leaveGuard(true, message => window.confirm(message))) { event.preventDefault(); event.stopPropagation() }
   else leaving.current = true
  }
  // The Navigation API also covers browser Back and Forward in supporting browsers.
  const navigation = (window as unknown as { navigation?: EventTarget }).navigation
  function navigate(event: Event) {
   if (!leaving.current && event.cancelable && !leaveGuard(true, message => window.confirm(message))) event.preventDefault()
  }
  window.addEventListener('beforeunload', beforeUnload)
  document.addEventListener('click', click, true)
  navigation?.addEventListener('navigate', navigate)
  return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', click, true); navigation?.removeEventListener('navigate', navigate) }
 }, [dirty])
 function dragEnd({ active, over }: DragEndEvent) {
  if (!over || active.id === over.id) return
  const from = draft.items.findIndex(item => item.id === active.id), to = draft.items.findIndex(item => item.id === over.id)
  if (from >= 0 && to >= 0) dispatch({ type: 'move', from, to })
 }
 function say(kind: 'start' | 'move' | 'drop', id: string | number, over?: string | number) {
  const item = draft.items.find(item => item.id === id)
  const position = draft.items.findIndex(item => item.id === (over ?? id)) + 1
  return announcement(kind, item?.name ?? '', position, draft.items.length)
 }
 async function done() {
  if (busy.current || !draft.title.trim()) return
  if (!dirty) { leaving.current = true; router.push('/d/' + dashboardKey); return }
  busy.current = true; setSaving(true); setError(null)
  try {
   const result = await withSession(() => dashApi.organize(dashboardKey, toOrganizeInput(draft, original)), auth.requestLogin)
   addPending({ key: dashboardKey, kind: 'dashboard', op: 'upsert', afterBlock: result.afterBlock, txHash: result.txHash })
   leaving.current = true
   router.push('/d/' + dashboardKey)
  } catch (error) { setError(saveErrorMessage(error)); busy.current = false; setSaving(false) }
 }
 return <div className={s.board}>
  <header className={s.header}>
   <OrganizeTitle value={draft.title} disabled={saving} onChange={value => dispatch({ type: 'title', value })}/>
   {dirty && <span className={s.dirty}>Unsaved changes</span>}
   <button type="button" className="btn" disabled={saving || remainingSlots(draft) === 0} onClick={() => setImportOpen(true)}>+ Import widget</button>
   <Link className="btn" href={'/widgets/new?dashboard=' + dashboardKey}>+ New widget</Link>
   <button type="button" className="btn btn-primary" disabled={saving || !draft.title.trim()} onClick={() => void done()}>{saving ? 'Saving…' : 'Done'}</button>
  </header>
  {error && <p className="error" role="alert">{error}</p>}
  <div className={s.tabs} role="tablist" aria-label="Organize view">{(['order', 'preview'] as const).map(value => <button key={value} type="button" className="btn" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{value === 'order' ? 'Order' : 'Preview'}</button>)}</div>
  <div className={s.body} data-tab={tab}>
   <fieldset className={s.list} disabled={saving} style={{ border: 0, padding: 0, margin: 0 }} aria-label="Widget order">
    {!draft.items.length && <p>No widgets yet. Import one or create a new widget.</p>}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd} accessibility={{ announcements: {
     onDragStart: ({ active }) => say('start', active.id),
     onDragOver: ({ active, over }) => over ? say('move', active.id, over.id) : undefined,
     onDragEnd: ({ active, over }) => say('drop', active.id, over?.id),
     onDragCancel: () => announcement('cancel', '', 0, draft.items.length),
    } }}>
     <SortableContext items={draft.items.map(item => item.id)} strategy={verticalListSortingStrategy}>{draft.items.map((item, index) => <SortableRow key={item.id} item={item} index={index} count={draft.items.length} head={head} saving={saving} dispatch={dispatch} importedUser={data.widgets?.get(item.widget)?.user ?? importedUsers.current.get(item.widget)}/>)}</SortableContext>
    </DndContext>
   </fieldset>
   <div className={s.preview}><LayoutPreview items={draft.items}/></div>
  </div>
  {importOpen && <ImportModal dashboardTitle={draft.title} placed={onDashboard(draft)} remaining={remainingSlots(draft)} onClose={() => setImportOpen(false)} onAdd={widgets => { for (const widget of widgets) importedUsers.current.set(widget.key, widget.user); dispatch({ type: 'import', widgets, owner: data.dashboard!.user }); setImportOpen(false) }}/>}
 </div>
}
export function OrganizeBoard({ dashboardKey }: { dashboardKey: string }) {
 const key = dashboardKey.toLowerCase(), auth = useDashAuth(), data = useDashboard(key)
 const original = useRef<{ key: string; draft: OrganizeDraft } | null>(null)
 if (original.current?.key !== key) original.current = null
 if (!auth.config || auth.status === 'loading') return <p>Loading the index into your browser…</p>
 if (!auth.config.enabled) return <p>Dashboards are not enabled on this deployment.</p>
 if (auth.status === 'anonymous') return <LoginGate/>
 if (data.status === 'error') return <p className="error" role="alert">{data.error}</p>
 const access = organizeAccess({ auth: auth.status, address: auth.address, data })
 if (access === 'loading') return <p>Loading the index into your browser…</p>
 if (access === 'login') return <LoginGate/>
 if (access === 'missing') return <MissingDashboard/>
 if (access === 'not_owner') return <NotOwner dashboardKey={key}/>
 if (!data.widgets) return <p>Loading the index into your browser…</p>
 if (!original.current) original.current = { key, draft: draftFromDashboard(data.dashboard!, dashboardSlots(data.links, data.widgets)) }
 return <Editor key={key} dashboardKey={key} data={data} original={original.current.draft}/>
}

export function OrganizeTitle({ value, disabled, onChange }: { value: string; disabled: boolean; onChange(value: string): void }) {
 return <input className={s.title} aria-label="Dashboard title" maxLength={80} required value={value} disabled={disabled} onChange={event => onChange(event.target.value)}/>
}
