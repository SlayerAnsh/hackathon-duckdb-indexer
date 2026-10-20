export { extendTarget } from '../time'
import { isOfficialUser } from '../official'
import { ExpirationTime, type AttributeInputs, type WalletArkivClient, type PublicArkivClient } from '@arkiv-network/sdk'
import { addr, key } from '@arkiv-network/sdk/attr'
import { RpcError, type ArkivRpc } from '@asi/core'
import { type DashboardEntity, type LinkEntity, type WidgetEntity, asDashboard, asLink, asWidget, dashboardBundleExpr, jsonPayload, keysExprs, queryAll, widgetVersionExpr } from '../entities'
import { WIDGET_FLAGS, BLOCKS_PER_DAY, DASHBOARD_LIFETIME_DAYS, SIZES, isEntityKey, parseDashboardPayload, type Parsed, CONTENT_TYPE, DASH_PROJECT, MAX_LINKS_PER_DASHBOARD, type Size, type WidgetPayload, type WriteResult } from '../schema'
import { dashErrors } from './errors'
import type { WriteQueue } from './queue'
import type { Session } from './session'

export type DashWriterClient = Pick<WalletArkivClient, 'account' | 'createEntity' | 'patchEntity' | 'executeBatch'> & Pick<PublicArkivClient, 'predictEntityKeys'>
export type DashReader = Pick<ArkivRpc, 'query' | 'blockNumber'>
export type OpsDeps = { client: DashWriterClient; reader: DashReader; wallet: string; queue: WriteQueue }
const hex = (value: string) => value.toLowerCase() as `0x${string}`

function requireUser(deps: OpsDeps, session: Session): void {
  if (isOfficialUser(session.address, deps.wallet)) throw dashErrors.forbidden()
}

export function widgetAttributes(w: WidgetPayload, s: Session): AttributeInputs {
  return { type: 'widget', project: DASH_PROJECT, user: addr(hex(s.address)), login: s.login, name: w.name, chart: w.chart }
}
export async function read<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() } catch (error) {
    if (error instanceof RpcError && error.status === 429) {
      const retry = error.retryAfter === null ? NaN : Number(error.retryAfter)
      throw dashErrors.busy(Number.isFinite(retry) && retry >= 0 ? retry : undefined)
    }
    throw error
  }
}
export async function write<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() } catch (error) {
    let current: unknown = error
    for (let depth = 0; depth <= 5 && current && typeof current === 'object'; depth++) {
      const entry = current as { data?: { errorName?: unknown }; errorName?: unknown; message?: unknown; cause?: unknown }
      if ([entry.data?.errorName, entry.errorName].some(name => name === 'EntityNotFound' || name === 'EntityExpired') ||
        (typeof entry.message === 'string' && /no entity 0x|entity 0x\S+ expired at block|EntityNotFound|EntityExpired/i.test(entry.message))) {
        throw dashErrors.notFound()
      }
      current = entry.cause
    }
    throw error
  }
}
function requireOwner(user: string, session: Session): void {
  if (user !== session.address.toLowerCase()) throw dashErrors.forbidden()
}
export function createWidget(deps: OpsDeps, s: Session, input: { widget: WidgetPayload; addTo?: { dashboard: string; size: Size }; replaces?: string }): Promise<WriteResult> {
  return deps.queue.run(async () => {
    requireUser(deps, s)
    if (input.addTo && input.replaces) throw dashErrors.invalid('Choose addTo or replaces, not both.')
    let head: number
    let dashboard: DashboardEntity | undefined
    let position = 0
    let relinks: LinkEntity[] = []
    if (input.replaces) {
      const result = await read(() => queryAll(deps.reader, widgetVersionExpr(deps.wallet, input.replaces!, s.address)))
      head = result.head
      const live = result.entities.filter(e => e.expiresAt > head)
      const old = live.filter(e => e.key === hex(input.replaces!)).map(e => asWidget(e, deps.wallet)).find(w => w !== null)
      if (!old) throw dashErrors.notFound()
      requireOwner(old.owner, s)
      relinks = live.map(e => asLink(e, deps.wallet)).filter((l): l is LinkEntity => l !== null && l.widgetKey === old.key && l.user === s.address.toLowerCase())
      if (relinks.length > MAX_LINKS_PER_DASHBOARD) throw dashErrors.conflict('conflict', 'Too many dashboards use this widget.')
    } else if (input.addTo) {
      const result = await read(() => queryAll(deps.reader, dashboardBundleExpr(deps.wallet, input.addTo!.dashboard)))
      head = result.head
      dashboard = result.entities.filter(e => e.key === hex(input.addTo!.dashboard) && e.expiresAt > head).map(e => asDashboard(e, deps.wallet)).find(d => d !== null)
      if (!dashboard) throw dashErrors.notFound()
      requireOwner(dashboard.user, s)
      const links = result.entities.filter(e => e.expiresAt > head).map(e => asLink(e, deps.wallet)).filter((l): l is LinkEntity => l !== null && l.dashboardKey === dashboard!.key && l.user === dashboard!.user)
      if (links.length >= MAX_LINKS_PER_DASHBOARD) throw dashErrors.conflict('full', 'Dashboard is full.')
      position = links.reduce((max, l) => Math.max(max, l.link.position), -1) + 1
    } else head = await read(() => deps.reader.blockNumber())
    const predicted = await read(() => deps.client.predictEntityKeys({ owner: deps.client.account!.address, count: (input.addTo ? 2 : 1) as number }))
    const widgetKey = predicted[0]
    const creates = [{ attributes: widgetAttributes(input.widget, s), payload: jsonPayload(input.widget), contentType: CONTENT_TYPE,
      expires: ExpirationTime.fromSeconds(input.widget.lifetimeDays * 86400), flags: WIDGET_FLAGS, salt: widgetKey.salt }]
    const patches = relinks.map(l => ({ entityKey: hex(l.key), set: { widget: key(widgetKey.key) }, payload: jsonPayload({ ...l.link, name: input.widget.name }), contentType: CONTENT_TYPE }))
    const result = await write(() => deps.client.executeBatch({
      creates: [...creates, ...(dashboard && input.addTo ? [{ ...linkCreate(dashboard, { widget: widgetKey.key, size: input.addTo.size, position, name: input.widget.name }, dashboard.expiresAt), salt: predicted[1].salt }] : [])],
      ...(patches.length ? { patches } : {}), ownershipChanges: [{ entityKey: widgetKey.key, newOwner: hex(s.address) }],
    }))
    return { txHash: result.txHash, afterBlock: head, key: widgetKey.key, expiresAt: head + input.widget.lifetimeDays * BLOCKS_PER_DAY,
      ...(input.addTo ? { linkKey: predicted[1].key } : {}), ...(input.replaces ? { relinked: relinks.map(l => l.key) } : {}) }
  })
}

export type { OrganizeItem, OrganizeInput } from '../schema'
import type { OrganizeItem, OrganizeInput } from '../schema'
export type OrganizePlan = {
  creates: { widget: string; size: Size; position: number; name: string }[]
  patches: { link: string; size: Size; position: number; name: string }[]
  deletes: string[]; extend: string[]; target: number; title?: string; cover?: string | null
}
export function parseOrganizeInput(input: unknown): Parsed<OrganizeInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Invalid organize input.' }
  const value = input as Record<string, unknown>
  if (!Array.isArray(value.items) || value.items.length > MAX_LINKS_PER_DASHBOARD) return { ok: false, error: 'Expected at most 48 items.' }
  let title: string | undefined
  if (value.title !== undefined) {
    const parsed = parseDashboardPayload({ v: 1, title: value.title, description: '' })
    if (!parsed.ok) return parsed
    title = parsed.value.title
  }
  if (value.cover !== undefined && value.cover !== null && (typeof value.cover !== 'string' || !isEntityKey(value.cover))) return { ok: false, error: 'Invalid cover key.' }
  const cover = typeof value.cover === 'string' ? value.cover.toLowerCase() : value.cover
  const items: OrganizeItem[] = []
  for (const item of value.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      !(item.link === null || (typeof item.link === 'string' && isEntityKey(item.link))) ||
      typeof item.widget !== 'string' || !isEntityKey(item.widget) || !SIZES.includes(item.size)) return { ok: false, error: 'Invalid organize item.' }
    items.push({ link: item.link === null ? null : item.link.toLowerCase(), widget: item.widget.toLowerCase(), size: item.size })
  }
  return { ok: true, value: { items, ...(cover === undefined ? {} : { cover: cover as string | null }), ...(title === undefined ? {} : { title }) } }
}
export function planOrganize(state: { head: number; dashboard: DashboardEntity; links: LinkEntity[]; widgets: Map<string, WidgetEntity> }, input: OrganizeInput): OrganizePlan {
  if (input.items.length > MAX_LINKS_PER_DASHBOARD) throw dashErrors.conflict('full', 'Dashboard is full.')
  const plan: OrganizePlan = { creates: [], patches: [], deletes: [], extend: [], target: state.head + DASHBOARD_LIFETIME_DAYS * BLOCKS_PER_DAY,
    ...(input.title === undefined ? {} : { title: input.title }) }
  if (state.dashboard.expiresAt < plan.target) plan.extend.push(state.dashboard.key)
  const links = new Map(state.links.map(l => [l.key, l]))
  const kept = new Set<string>(), widgets = new Set<string>()
  input.items.forEach((item, position) => {
    const widgetKey = hex(item.widget)
    if (widgets.has(widgetKey)) throw dashErrors.conflict('conflict', 'Widget is already on this dashboard.')
    widgets.add(widgetKey)
    if (item.link !== null) {
      const l = links.get(hex(item.link))
      if (!l || l.dashboardKey !== state.dashboard.key || l.user !== state.dashboard.user || l.expiresAt <= state.head || l.widgetKey !== widgetKey || kept.has(l.key)) throw dashErrors.invalid('Invalid dashboard link.')
      kept.add(l.key)
      if (l.link.size !== item.size || l.link.position !== position) plan.patches.push({ link: l.key, size: item.size, position, name: l.link.name })
      if (l.expiresAt < plan.target) plan.extend.push(l.key)
    } else {
      const w = state.widgets.get(widgetKey)
      if (!w || w.expiresAt <= state.head) throw dashErrors.notFound()
      plan.creates.push({ widget: widgetKey, size: item.size, position, name: w.name })
    }
  })
  const wanted = input.cover === undefined ? state.dashboard.cover ?? null : input.cover === null ? null : hex(input.cover)
  const cover = wanted && widgets.has(wanted) && state.widgets.has(wanted) && state.widgets.get(wanted)!.expiresAt > state.head ? wanted : null
  if (cover !== (state.dashboard.cover ?? null)) plan.cover = cover
  plan.deletes = state.links.filter(l => !kept.has(l.key)).map(l => l.key)
  return plan
}
async function readDashboard(deps: OpsDeps, s: Session, entityKey: string, extraKeys: string[] = []) {
  const { head, entities } = await read(() => queryAll(deps.reader, dashboardBundleExpr(deps.wallet, entityKey, extraKeys)))
  const live = entities.filter(e => e.expiresAt > head)
  const dashboard = live.filter(e => e.key === hex(entityKey)).map(e => asDashboard(e, deps.wallet)).find(d => d !== null)
  if (!dashboard) throw dashErrors.notFound()
  requireOwner(dashboard.user, s)
  const links = live.map(e => asLink(e, deps.wallet)).filter((l): l is LinkEntity => l !== null && l.dashboardKey === dashboard.key && l.user === dashboard.user)
  const widgets = new Map(live.map(e => asWidget(e, deps.wallet)).filter((w): w is WidgetEntity => w !== null).map(w => [w.key, w]))
  return { head, dashboard, links, widgets }
}
function linkCreate(dashboard: DashboardEntity, item: { widget: string; size: Size; position: number; name: string }, expiresAt: number) {
  return { attributes: { type: 'link', project: DASH_PROJECT, user: addr(hex(dashboard.user)), dashboard: key(hex(dashboard.key)), widget: key(hex(item.widget)) },
    payload: jsonPayload({ v: 1, size: item.size, position: item.position, name: item.name }), contentType: CONTENT_TYPE, expires: ExpirationTime.atBlock(BigInt(expiresAt)) }
}
export function createDashboard(deps: OpsDeps, s: Session, input: { title: string; description?: string }): Promise<WriteResult> {
  return deps.queue.run(async () => {
    requireUser(deps, s)
    const head = await read(() => deps.reader.blockNumber())
    const result = await write(() => deps.client.createEntity({ attributes: { type: 'dashboard', project: DASH_PROJECT, user: addr(hex(s.address)), login: s.login, title: input.title },
      payload: jsonPayload({ v: 1, title: input.title, description: input.description ?? '' }), contentType: CONTENT_TYPE, expires: ExpirationTime.fromSeconds(DASHBOARD_LIFETIME_DAYS * 86400) }))
    return { txHash: result.txHash, afterBlock: head, key: result.entityKey, expiresAt: Number(result.expiresAt) }
  })
}
export function updateDashboard(deps: OpsDeps, s: Session, entityKey: string, input: { title: string; description?: string }): Promise<WriteResult> {
  return deps.queue.run(async () => {
    requireUser(deps, s)
    const { head } = await readDashboard(deps, s, entityKey)
    const result = await write(() => deps.client.patchEntity({ entityKey: hex(entityKey), set: { title: input.title },
      payload: jsonPayload({ v: 1, title: input.title, description: input.description ?? '' }), contentType: CONTENT_TYPE }))
    return { txHash: result.txHash, afterBlock: head }
  })
}
export function deleteDashboard(deps: OpsDeps, s: Session, entityKey: string): Promise<WriteResult> {
  return deps.queue.run(async () => {
    requireUser(deps, s)
    const { head, dashboard, links } = await readDashboard(deps, s, entityKey)
    const result = await write(() => deps.client.executeBatch({ deletes: [dashboard, ...links].map(e => ({ entityKey: hex(e.key) })) }))
    return { txHash: result.txHash, afterBlock: head }
  })
}
export function organizeDashboard(deps: OpsDeps, s: Session, entityKey: string, input: OrganizeInput): Promise<WriteResult> {
  return deps.queue.run(async () => {
    requireUser(deps, s)
    const state = await readDashboard(deps, s, entityKey, input.items.filter(i => i.link === null).map(i => i.widget))
    const coverKey = input.cover === undefined ? state.dashboard.cover : input.cover
    if (coverKey && !state.widgets.has(hex(coverKey))) {
      const result = await read(() => queryAll(deps.reader, keysExprs(deps.wallet, [coverKey])[0]))
      for (const entity of result.entities) { const widget = asWidget(entity, deps.wallet); if (widget && widget.expiresAt > state.head) state.widgets.set(widget.key, widget) }
    }
    const plan = planOrganize(state, input)
    const patches = plan.patches.map(p => ({ entityKey: hex(p.link), payload: jsonPayload({ v: 1, size: p.size, position: p.position, name: p.name }), contentType: CONTENT_TYPE }))
    // SDK set merges named attributes; unset removes cover without touching identity or slug.
    const titlePatches = plan.title === undefined && plan.cover === undefined ? [] : [{ entityKey: hex(state.dashboard.key),
      set: { ...(plan.title === undefined ? {} : { title: plan.title }), ...(plan.cover ? { cover: key(hex(plan.cover)) } : {}) },
      ...(plan.cover === null ? { unset: ['cover'] } : {}),
      ...(plan.title === undefined ? {} : { payload: jsonPayload({ ...state.dashboard.dashboard, title: plan.title }), contentType: CONTENT_TYPE }) }]
    if (!plan.creates.length && !patches.length && !titlePatches.length && !plan.deletes.length && !plan.extend.length) return { txHash: '', afterBlock: state.head }
    const result = await write(() => deps.client.executeBatch({ creates: plan.creates.map(c => linkCreate(state.dashboard, c, plan.target)), patches: [...patches, ...titlePatches],
      deletes: plan.deletes.map(k => ({ entityKey: hex(k) })), extensions: plan.extend.map(k => ({ entityKey: hex(k), expires: ExpirationTime.atBlock(BigInt(plan.target)) })) }))
    return { txHash: result.txHash, afterBlock: state.head, expiresAt: plan.target }
  })
}
export function addLink(deps: OpsDeps, s: Session, dashboardKey: string, input: { widget: string; size: Size }): Promise<WriteResult> {
  return deps.queue.run(async () => {
    requireUser(deps, s)
    const { head, dashboard, links, widgets } = await readDashboard(deps, s, dashboardKey, [input.widget])
    const widget = widgets.get(hex(input.widget))
    if (!widget) throw dashErrors.notFound()
    if (links.some(l => l.widgetKey === widget.key)) throw dashErrors.conflict('conflict', 'Widget is already on this dashboard.')
    if (links.length >= MAX_LINKS_PER_DASHBOARD) throw dashErrors.conflict('full', 'Dashboard is full.')
    const result = await write(() => deps.client.createEntity(linkCreate(dashboard, { widget: widget.key, size: input.size, position: links.reduce((max, l) => Math.max(max, l.link.position), -1) + 1, name: widget.name }, dashboard.expiresAt)))
    return { txHash: result.txHash, afterBlock: head, linkKey: result.entityKey }
  })
}
