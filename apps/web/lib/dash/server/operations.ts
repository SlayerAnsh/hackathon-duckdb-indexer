import { ExpirationTime, type AttributeInputs, type WalletArkivClient, type PublicArkivClient } from '@arkiv-network/sdk'
import { addr, key } from '@arkiv-network/sdk/attr'
import { RpcError, type ArkivRpc } from '@asi/core'
import { type DashboardEntity, type LinkEntity, type WidgetEntity, asDashboard, asLink, asWidget, dashboardBundleExpr, jsonPayload, keysExprs, queryAll, widgetExtendExpr } from '../entities'
import { BLOCKS_PER_DAY, DASHBOARD_LIFETIME_DAYS, SIZES, isEntityKey, parseDashboardPayload, type Parsed, CONTENT_TYPE, DASH_PROJECT, MAX_LINKS_PER_DASHBOARD, MAX_REMAINING_DAYS, type Size, type WidgetPayload, type WriteResult } from '../schema'
import { dashErrors } from './errors'
import type { WriteQueue } from './queue'
import type { Session } from './session'

export type DashWriterClient = Pick<WalletArkivClient, 'account' | 'createEntity' | 'patchEntity' | 'extendEntity' | 'deleteEntity' | 'executeBatch'> & Pick<PublicArkivClient, 'predictEntityKeys'>
export type DashReader = Pick<ArkivRpc, 'query' | 'blockNumber'>
export type OpsDeps = { client: DashWriterClient; reader: DashReader; wallet: string; queue: WriteQueue }
const hex = (value: string) => value.toLowerCase() as `0x${string}`

export function extendTarget(expiresAt: number, head: number, lifetimeDays: number): number {
  return Math.min(expiresAt + lifetimeDays * BLOCKS_PER_DAY, head + MAX_REMAINING_DAYS * BLOCKS_PER_DAY)
}
export function widgetAttributes(w: WidgetPayload, s: Session): AttributeInputs {
  return { type: 'widget', project: DASH_PROJECT, user: addr(hex(s.address)), login: s.login, name: w.name, chart: w.chart }
}
async function read<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() } catch (error) {
    if (error instanceof RpcError && error.status === 429) {
      const retry = error.retryAfter === null ? NaN : Number(error.retryAfter)
      throw dashErrors.busy(Number.isFinite(retry) && retry >= 0 ? retry : undefined)
    }
    throw error
  }
}
async function write<T>(work: () => Promise<T>): Promise<T> {
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
async function readWidget(deps: OpsDeps, entityKey: string, expression = keysExprs(deps.wallet, [entityKey])[0]) {
  const { head, entities } = await read(() => queryAll(deps.reader, expression))
  const widget = entities.filter(e => e.key === hex(entityKey) && e.expiresAt > head).map(e => asWidget(e, deps.wallet)).find(w => w !== null)
  if (!widget) throw dashErrors.notFound()
  return { head, entities, widget }
}
function requireOwner(user: string, session: Session): void {
  if (user !== session.address.toLowerCase()) throw dashErrors.forbidden()
}
export function createWidget(deps: OpsDeps, s: Session, input: { widget: WidgetPayload; addTo?: { dashboard: string; size: Size } }): Promise<WriteResult> {
  return deps.queue.run(async () => {
    const create = { attributes: widgetAttributes(input.widget, s), payload: jsonPayload(input.widget), contentType: CONTENT_TYPE,
      expires: ExpirationTime.fromSeconds(input.widget.lifetimeDays * 86400) }
    if (!input.addTo) {
      const head = await read(() => deps.reader.blockNumber())
      const result = await write(() => deps.client.createEntity(create))
      return { txHash: result.txHash, afterBlock: head, key: result.entityKey, expiresAt: Number(result.expiresAt) }
    }
    const addTo = input.addTo
    const { head, entities } = await read(() => queryAll(deps.reader, dashboardBundleExpr(deps.wallet, addTo.dashboard)))
    const dashboard = entities.filter(e => e.key === hex(addTo.dashboard) && e.expiresAt > head).map(e => asDashboard(e, deps.wallet)).find(d => d !== null)
    if (!dashboard) throw dashErrors.notFound()
    requireOwner(dashboard.user, s)
    const links = entities.filter(e => e.expiresAt > head).map(e => asLink(e, deps.wallet))
      .filter(l => l !== null && l.dashboardKey === dashboard.key && l.user === dashboard.user)
    if (links.length >= MAX_LINKS_PER_DASHBOARD) throw dashErrors.conflict('full', 'Dashboard is full.')
    const position = links.reduce((max, l) => Math.max(max, l!.link.position), -1) + 1
    const [widgetKey, linkKey] = await read(() => deps.client.predictEntityKeys({ owner: deps.client.account!.address, count: 2 }))
    const result = await write(() => deps.client.executeBatch({ creates: [
      { ...create, salt: widgetKey.salt },
      { salt: linkKey.salt, attributes: { type: 'link', project: DASH_PROJECT, user: addr(hex(s.address)), dashboard: key(hex(dashboard.key)), widget: key(widgetKey.key) },
        payload: jsonPayload({ v: 1, size: addTo.size, position, name: input.widget.name }), contentType: CONTENT_TYPE, expires: ExpirationTime.atBlock(BigInt(dashboard.expiresAt)) },
    ] }))
    return { txHash: result.txHash, afterBlock: head, key: widgetKey.key, linkKey: linkKey.key, expiresAt: head + input.widget.lifetimeDays * BLOCKS_PER_DAY }
  })
}
export function updateWidget(deps: OpsDeps, s: Session, entityKey: string, widget: WidgetPayload): Promise<WriteResult> {
  return deps.queue.run(async () => {
    const current = await readWidget(deps, entityKey)
    requireOwner(current.widget.user, s)
    const result = await write(() => deps.client.patchEntity({ entityKey: hex(entityKey), set: { name: widget.name, chart: widget.chart },
      payload: jsonPayload({ ...widget, lifetimeDays: current.widget.widget.lifetimeDays }), contentType: CONTENT_TYPE }))
    return { txHash: result.txHash, afterBlock: current.head }
  })
}
export function extendWidget(deps: OpsDeps, s: Session, entityKey: string): Promise<WriteResult> {
  return deps.queue.run(async () => {
    const { head, entities, widget } = await readWidget(deps, entityKey, widgetExtendExpr(deps.wallet, entityKey, s.address.toLowerCase()))
    const linked = entities.filter(e => e.expiresAt > head).map(e => asLink(e, deps.wallet))
      .some(l => l !== null && l.widgetKey === widget.key && l.user === s.address.toLowerCase())
    if (widget.user !== s.address.toLowerCase() && !linked) throw dashErrors.forbidden()
    const target = extendTarget(widget.expiresAt, head, widget.widget.lifetimeDays)
    if (target <= widget.expiresAt) throw dashErrors.conflict('at_cap', 'Widget already has 90 days remaining.')
    const result = await write(() => deps.client.extendEntity({ entityKey: hex(entityKey), expires: ExpirationTime.atBlock(BigInt(target)) }))
    return { txHash: result.txHash, afterBlock: head, expiresAt: target }
  })
}
export function deleteWidget(deps: OpsDeps, s: Session, entityKey: string): Promise<WriteResult> {
  return deps.queue.run(async () => {
    const { head, widget } = await readWidget(deps, entityKey)
    requireOwner(widget.user, s)
    const result = await write(() => deps.client.deleteEntity({ entityKey: hex(entityKey) }))
    return { txHash: result.txHash, afterBlock: head }
  })
}

export type OrganizeItem = { link: string | null; widget: string; size: Size }
export type OrganizeInput = { title?: string; items: OrganizeItem[] }
export type OrganizePlan = {
  creates: { widget: string; size: Size; position: number; name: string }[]
  patches: { link: string; size: Size; position: number; name: string }[]
  deletes: string[]; extend: string[]; target: number; title?: string
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
  const items: OrganizeItem[] = []
  for (const item of value.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      !(item.link === null || (typeof item.link === 'string' && isEntityKey(item.link))) ||
      typeof item.widget !== 'string' || !isEntityKey(item.widget) || !SIZES.includes(item.size)) return { ok: false, error: 'Invalid organize item.' }
    items.push({ link: item.link === null ? null : item.link.toLowerCase(), widget: item.widget.toLowerCase(), size: item.size })
  }
  return { ok: true, value: { items, ...(title === undefined ? {} : { title }) } }
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
    const head = await read(() => deps.reader.blockNumber())
    const result = await write(() => deps.client.createEntity({ attributes: { type: 'dashboard', project: DASH_PROJECT, user: addr(hex(s.address)), login: s.login, title: input.title },
      payload: jsonPayload({ v: 1, title: input.title, description: input.description ?? '' }), contentType: CONTENT_TYPE, expires: ExpirationTime.fromSeconds(DASHBOARD_LIFETIME_DAYS * 86400) }))
    return { txHash: result.txHash, afterBlock: head, key: result.entityKey, expiresAt: Number(result.expiresAt) }
  })
}
export function updateDashboard(deps: OpsDeps, s: Session, entityKey: string, input: { title: string; description?: string }): Promise<WriteResult> {
  return deps.queue.run(async () => {
    const { head } = await readDashboard(deps, s, entityKey)
    const result = await write(() => deps.client.patchEntity({ entityKey: hex(entityKey), set: { title: input.title },
      payload: jsonPayload({ v: 1, title: input.title, description: input.description ?? '' }), contentType: CONTENT_TYPE }))
    return { txHash: result.txHash, afterBlock: head }
  })
}
export function deleteDashboard(deps: OpsDeps, s: Session, entityKey: string): Promise<WriteResult> {
  return deps.queue.run(async () => {
    const { head, dashboard, links } = await readDashboard(deps, s, entityKey)
    const result = await write(() => deps.client.executeBatch({ deletes: [dashboard, ...links].map(e => ({ entityKey: hex(e.key) })) }))
    return { txHash: result.txHash, afterBlock: head }
  })
}
export function organizeDashboard(deps: OpsDeps, s: Session, entityKey: string, input: OrganizeInput): Promise<WriteResult> {
  return deps.queue.run(async () => {
    const state = await readDashboard(deps, s, entityKey, input.items.filter(i => i.link === null).map(i => i.widget))
    const plan = planOrganize(state, input)
    const patches = plan.patches.map(p => ({ entityKey: hex(p.link), payload: jsonPayload({ v: 1, size: p.size, position: p.position, name: p.name }), contentType: CONTENT_TYPE }))
    const titlePatches = plan.title === undefined ? [] : [{ entityKey: hex(state.dashboard.key), set: { title: plan.title }, payload: jsonPayload({ ...state.dashboard.dashboard, title: plan.title }), contentType: CONTENT_TYPE }]
    if (!plan.creates.length && !patches.length && !titlePatches.length && !plan.deletes.length && !plan.extend.length) return { txHash: '', afterBlock: state.head }
    const result = await write(() => deps.client.executeBatch({ creates: plan.creates.map(c => linkCreate(state.dashboard, c, plan.target)), patches: [...patches, ...titlePatches],
      deletes: plan.deletes.map(k => ({ entityKey: hex(k) })), extensions: plan.extend.map(k => ({ entityKey: hex(k), expires: ExpirationTime.atBlock(BigInt(plan.target)) })) }))
    return { txHash: result.txHash, afterBlock: state.head, expiresAt: plan.target }
  })
}
export function addLink(deps: OpsDeps, s: Session, dashboardKey: string, input: { widget: string; size: Size }): Promise<WriteResult> {
  return deps.queue.run(async () => {
    const { head, dashboard, links, widgets } = await readDashboard(deps, s, dashboardKey, [input.widget])
    const widget = widgets.get(hex(input.widget))
    if (!widget) throw dashErrors.notFound()
    if (links.some(l => l.widgetKey === widget.key)) throw dashErrors.conflict('conflict', 'Widget is already on this dashboard.')
    if (links.length >= MAX_LINKS_PER_DASHBOARD) throw dashErrors.conflict('full', 'Dashboard is full.')
    const result = await write(() => deps.client.createEntity(linkCreate(dashboard, { widget: widget.key, size: input.size, position: links.reduce((max, l) => Math.max(max, l.link.position), -1) + 1, name: widget.name }, dashboard.expiresAt)))
    return { txHash: result.txHash, afterBlock: head, linkKey: result.entityKey }
  })
}
