'use client'
import { useEffect, useReducer, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { useDashAuth, type DashAuth } from '../auth/DashAuthProvider'
import { MAX_LINKS_PER_DASHBOARD, type Size } from '../../lib/dash/schema'
import type { WidgetEntity } from '../../lib/dash/entities'
import { useDashboard, type DashboardData } from '../../lib/dash/use-dashboard'
import { dashboardSlots, type SlotStatus } from '../../lib/dash/slots'
import { announcement, draftFromDashboard, isDirty, onDashboard, organizeReducer, remainingSlots, toOrganizeInput, type DraftItem, type OrganizeDraft } from '../../lib/dash/organize-state'
import { dashApi } from '../../lib/dash/api'
import { saveErrorMessage, withSession } from '../../lib/dash/auth-client'
import { addPending } from '../../lib/dash/pending'
import { useWidgetEntities } from '../../lib/dash/entity-cache'
import { figureNumbers, importedFrom } from '../../lib/dash/report'
import { widgetCountSql } from '../../lib/dash/sql'
import { useIndex } from '../../lib/use-index'
import { useTimedQuery } from '../../lib/use-query'
import { cx } from '../dash/cx'
import { LoginGate } from './LoginGate'
import { DashboardNotice, DashboardSkeleton, MissingDashboard } from './DashboardView'
import { EmptyState, PlusIcon } from './EmptyState'
import { ImportModal } from './ImportModal'
import { GripIcon, OrganizeTileFooter, OrganizeTileHeader } from './OrganizeRow'
import { figureSpans, SavedWidgetCard } from './SavedWidgetCard'
import r from './report.module.css'
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
 return <div className={`${r.page} ${r.state}`}><EmptyState icon="dashboard" title="You cannot organize this dashboard" body="Only the owner can organize this dashboard. You can still view it and share its link."
  actions={<Link className="btn btn-primary" href={'/d/' + dashboardKey}>View dashboard</Link>}/></div>
}
/** Status of one tile in edit mode: expired by the draft or the live head, loading until its widget entity is known. */
export function tileStatus(item: DraftItem, widget: WidgetEntity | undefined, settled: boolean, head: number): SlotStatus {
 if (item.expired || (widget && widget.expiresAt <= head)) return 'expired'
 return widget ? 'live' : settled ? 'expired' : 'loading'
}
type Dispatch = React.Dispatch<Parameters<typeof organizeReducer>[1]>
type TileProps = { item: DraftItem; index: number; count: number; head: number; version: number; widget?: WidgetEntity; settled: boolean; figure?: number; subtitle: string | null
 starred: boolean; selected: boolean; saving: boolean; dispatch: Dispatch; onSelect(id: string): void }
function SortableTile({ item, index, count, head, version, widget, settled, figure, subtitle, starred, selected, saving, dispatch, onSelect }: TileProps) {
 const status = tileStatus(item, widget, settled, head)
 const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: item.id, disabled: saving })
 return <SavedWidgetCard id={'tile-' + item.id} name={item.name} payload={widget?.widget ?? null} status={status} size={item.size} version={version} head={head}
  figure={figure} subtitle={subtitle} official={widget?.official}
  edit={{ selected, dragging: isDragging, flash: item.flash, rootRef: setNodeRef, transition, onSelect: () => onSelect(item.id),
   transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
   header: <OrganizeTileHeader starred={starred} onStar={() => dispatch({ type: "star", key: item.widget })} item={item} index={index} count={count} onRemove={() => dispatch({ type: 'remove', id: item.id })}
    dragHandle={<button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} className={`${s.handle} has-tip`} data-tip-pos="start" data-tip="Drag to move" aria-label={`Reorder ${item.name}`} disabled={saving}><GripIcon/></button>}/>,
   footer: <OrganizeTileFooter item={item} head={head} importedUser={widget?.user} onResize={size => dispatch({ type: 'resize', id: item.id, size })}/> }}/>
}
const SavedIcon = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="3" width="15" height="14" rx="2"/><path d="M6 13.5v-3M10 13.5v-6M14 13.5v-4"/></svg>
const CodeIcon = () => <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 6-4 4 4 4m6-8 4 4-4 4"/></svg>
function useMyWidgetCount(): number | null {
 const { config, address } = useDashAuth()
 const { version } = useIndex()
 const run = !!config?.enabled && !!address
 const result = useTimedQuery(run ? widgetCountSql(config!.wallet, { search: '', chart: null, user: address! }) : '', version, { skip: !run })
 return result.data ? Number(result.data.rows[0]?.[0] ?? 0) : null
}
/** Last tile of the edit grid. Opens an in place chooser: import a saved widget, or write a new one. */
export function AddTile({ empty, size = 'md', remaining, newHref, onImport, initialOpen = false, mine }: { empty: boolean; size?: Size; remaining: number; newHref: string; onImport(): void; initialOpen?: boolean; mine?: number | null }) {
 const [open, setOpen] = useState(initialOpen || empty)
 const first = useRef<HTMLButtonElement>(null), trigger = useRef<HTMLButtonElement>(null)
 const wasOpen = useRef(open)
 useEffect(() => { if (open && !wasOpen.current) first.current?.focus(); wasOpen.current = open }, [open])
 const style = figureSpans(empty ? 'xl' : open && (size === 'xs' || size === 'sm') ? 'md' : size)
 if (remaining === 0) return <div className={cx(s.add, s.addFull)} style={style}><p>This dashboard is full ({MAX_LINKS_PER_DASHBOARD} of {MAX_LINKS_PER_DASHBOARD}). Remove a widget to make room.</p></div>
 if (!open) return <div className={s.add} style={style}><button ref={trigger} type="button" className={s.addButton} onClick={() => setOpen(true)}><PlusIcon/>Add widget</button></div>
 return <div className={cx(s.add, s.addOpen, empty && s.addEmpty)} style={style} role="group" aria-labelledby="add-title"
  onKeyDown={event => { if (event.key === 'Escape' && !empty) { event.preventDefault(); setOpen(false); requestAnimationFrame(() => trigger.current?.focus()) } }}>
  <div className={s.addHead}>
   <div><h2 id="add-title">{empty ? 'Add the first widget' : 'Add a widget'}</h2>
    {empty && <p>A dashboard is a grid of saved SQL widgets that run live in each reader&rsquo;s browser. Add widgets, size and arrange them here, then press Done to save the layout.</p>}</div>
   {!empty && <button type="button" className="ib ib-sm" aria-label="Close" onClick={() => setOpen(false)}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>}
  </div>
  <div className={s.choices}>
   <button ref={first} type="button" className={s.choice} onClick={onImport}>
    <span className={s.choiceIcon}><SavedIcon/></span>
    <span className={s.choiceText}><strong>Add a saved widget</strong><span>{mine ? `Pick from your ${mine} saved ${mine === 1 ? 'widget' : 'widgets'} or the community’s.` : 'Pick from widgets you or the community have saved.'}</span></span>
   </button>
   <Link className={s.choice} href={newHref}>
    <span className={s.choiceIcon}><CodeIcon/></span>
    <span className={s.choiceText}><strong>Write a new widget</strong><span>Write SQL and pick a chart. Saving it adds it to this dashboard.</span></span>
   </Link>
  </div>
 </div>
}
function ConnectedAddTile(props: Omit<Parameters<typeof AddTile>[0], 'mine'>) {
 return <AddTile {...props} mine={useMyWidgetCount()}/>
}
/** Fetches widget entities for items placed in this session (imports), so new tiles render their real query. */
function usePlacedWidgets(items: DraftItem[], known: Map<string, WidgetEntity> | null): { widgets: Map<string, WidgetEntity>; settled: Set<string> } {
 const keys = items.map(item => item.widget).filter(key => !known?.has(key))
 const result = useWidgetEntities(keys)
 const extra = new Map([...(result.data ?? [])].filter((pair): pair is [string,WidgetEntity] => pair[1] !== null))
 return { widgets: new Map([...(known ?? []), ...extra]), settled: new Set([...(known?.keys() ?? []), ...(result.data?.keys() ?? (result.error ? keys : []))]) }
}

export function OrganizeEditor({ dashboardKey, data, original }: { dashboardKey: string; data: DashboardData; original: OrganizeDraft }) {
 const auth = useDashAuth(), router = useRouter()
 const [draft, dispatch] = useReducer(organizeReducer, original)
 const [importOpen, setImportOpen] = useState(false)
 const [selected, setSelected] = useState<string | null>(null)
 const [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null)
 const busy = useRef(false), leaving = useRef(false)
 const dirty = isDirty(draft, original)
 const { state, version } = useIndex()
 const head = Math.max(data.head ?? 0, state.liveHead ?? 0)
 const { widgets, settled } = usePlacedWidgets(draft.items, data.widgets)
 const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
 useEffect(() => { setImportOpen(new URLSearchParams(window.location.search).get('import') === '1') }, [])
 useEffect(() => {
  if (!draft.items.some(item => item.flash)) return
  document.querySelector('[data-flash]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  const timer = setTimeout(() => dispatch({ type: 'clearFlash' }), 1600)
  return () => clearTimeout(timer)
 }, [draft.items])
 useEffect(() => {
  if (!selected) return
  function away(event: PointerEvent) { if (!(event.target instanceof Element && event.target.closest('[data-selected]'))) setSelected(null) }
  function escape(event: KeyboardEvent) { if (event.key === 'Escape') setSelected(null) }
  document.addEventListener('pointerdown', away)
  document.addEventListener('keydown', escape)
  return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', escape) }
 }, [selected])
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
 const slotsLeft = remainingSlots(draft)
 const owner = data.dashboard!.user, wallet = auth.config?.wallet ?? ''
 const statuses = draft.items.map(item => tileStatus(item, widgets.get(item.widget), settled.has(item.widget), head))
 const numbers = figureNumbers(draft.items.map((item, i) => ({ id: item.id, status: statuses[i]!, chart: widgets.get(item.widget)?.chart ?? item.chart })))
 return <div className={`${r.page} ${s.board}`}>
  <EditBar count={draft.items.length} dirty={dirty} saving={saving} canSave={!!draft.title.trim()} dashboardKey={dashboardKey} onDone={() => void done()}/>
  {error && <div className={`notice notice-bad ${s.error}`} role="alert"><div><p className="notice-title">Could not save the layout</p><p>{error}</p></div></div>}
  <header className={cx(r.header, s.header)}>
   <nav className={r.breadcrumb} aria-label="Breadcrumb"><ol>
    <li><Link href="/explore?tab=dashboards">Dashboards</Link></li>
    <li className={s.crumbTitle}><Link href={'/d/' + dashboardKey}>{original.title || 'Untitled dashboard'}</Link></li>
    <li aria-current="page"><span>Organize</span></li>
   </ol></nav>
   <OrganizeTitle value={draft.title} disabled={saving} onChange={value => dispatch({ type: 'title', value })}/>
   <p className={s.hint}>{draft.items.length ? <>Drag a tile by its handle, or focus the handle and press <kbd>Space</kbd> then the arrow keys. Tiles show live results; phones stack them in this order.</> : 'Widgets you add appear here with live results.'}</p>
  </header>
  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd} accessibility={{ announcements: {
   onDragStart: ({ active }) => say('start', active.id),
   onDragOver: ({ active, over }) => over ? say('move', active.id, over.id) : undefined,
   onDragEnd: ({ active, over }) => say('drop', active.id, over?.id),
   onDragCancel: () => announcement('cancel', '', 0, draft.items.length),
  } }}>
   <SortableContext items={draft.items.map(item => item.id)} strategy={rectSortingStrategy}>
    <section className={cx(r.grid, s.grid)} aria-label="Dashboard layout" aria-busy={saving || undefined}>
     {draft.items.map((item, index) => {
      const widget = widgets.get(item.widget)
      return <SortableTile starred={draft.cover === item.widget} key={item.id} item={item} index={index} count={draft.items.length} head={head} version={version} widget={widget} settled={settled.has(item.widget)}
       figure={numbers.get(item.id)} subtitle={widget && wallet ? importedFrom(widget.user, owner, wallet) : null} selected={selected === item.id} saving={saving} dispatch={dispatch} onSelect={setSelected}/>
     })}
     <ConnectedAddTile key={draft.items.length ? 'add' : 'add-empty'} empty={!draft.items.length} size={draft.items.at(-1)?.size} remaining={slotsLeft} newHref={'/widgets/new?dashboard=' + dashboardKey} onImport={() => setImportOpen(true)}/>
    </section>
   </SortableContext>
  </DndContext>
  {importOpen && <ImportModal dashboardTitle={draft.title} placed={onDashboard(draft)} remaining={slotsLeft} onClose={() => setImportOpen(false)} onAdd={picked => { dispatch({ type: 'import', widgets: picked, owner }); setImportOpen(false) }}/>}
 </div>
}
/** Slim sticky bar for the editing session: slots used, unsaved state, Cancel and Done. A bottom bar on phones. */
export function EditBar({ count, dirty, saving, canSave, dashboardKey, onDone }: { count: number; dirty: boolean; saving: boolean; canSave: boolean; dashboardKey: string; onDone(): void }) {
 return <div className={s.bar} role="region" aria-label="Layout editing">
  <p className={s.barInfo}>
   <strong>Editing layout</strong>
   <span className={s.barSlots}>{count} of {MAX_LINKS_PER_DASHBOARD} slots</span>
   <span role="status" className={dirty ? s.dirty : s.clean}>{dirty ? 'Unsaved changes' : 'No changes'}</span>
  </p>
  <div className={s.barActions}>
   <Link className="btn btn-sm btn-quiet" href={'/d/' + dashboardKey} aria-disabled={saving || undefined} tabIndex={saving ? -1 : undefined}>Cancel</Link>
   <button type="button" className="btn btn-sm btn-primary" disabled={saving || !canSave} aria-busy={saving || undefined} onClick={onDone}>{saving ? <><span className="spinner" aria-hidden="true"/>Saving…</> : 'Done'}</button>
  </div>
 </div>
}
export function OrganizeBoard({ dashboardKey }: { dashboardKey: string }) {
 const key = dashboardKey.toLowerCase(), auth = useDashAuth(), data = useDashboard(key)
 const original = useRef<{ key: string; draft: OrganizeDraft } | null>(null)
 if (original.current?.key !== key) original.current = null
 if (!auth.config || auth.status === 'loading') return <OrganizeSkeleton/>
 if (!auth.config.enabled) return <DashboardNotice tone="info" title="Dashboards are not enabled on this deployment." body="The SQL playground still works."/>
 if (auth.status === 'anonymous') return <LoginGate/>
 if (data.status === 'error') return <DashboardNotice tone="bad" title="Could not load this dashboard" body={data.error} onRetry={data.reload}/>
 const access = organizeAccess({ auth: auth.status, address: auth.address, data })
 if (access === 'loading') return <OrganizeSkeleton/>
 if (access === 'login') return <LoginGate/>
 if (access === 'missing') return <MissingDashboard/>
 if (access === 'not_owner') return <NotOwner dashboardKey={key}/>
 if (!data.widgets) return <OrganizeSkeleton/>
 if (!original.current) original.current = { key, draft: draftFromDashboard(data.dashboard!, dashboardSlots(data.links, data.widgets)) }
 return <OrganizeEditor key={key} dashboardKey={key} data={data} original={original.current.draft}/>
}

export function OrganizeTitle({ value, disabled, onChange }: { value: string; disabled: boolean; onChange(value: string): void }) {
 return <input className={s.title} aria-label="Dashboard title" placeholder="Untitled dashboard" maxLength={80} required value={value} disabled={disabled} aria-invalid={!value.trim() || undefined} onChange={event => onChange(event.target.value)}/>
}
/** Placeholder for the organize board while auth, the dashboard and its widgets load. */
export function OrganizeSkeleton() {
 return <DashboardSkeleton label="Loading the dashboard for editing"/>
}
