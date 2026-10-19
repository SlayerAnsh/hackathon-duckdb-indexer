import { ExpirationTime, type AttributeInputs, type WalletArkivClient, type PublicArkivClient } from '@arkiv-network/sdk'
import { addr, key } from '@arkiv-network/sdk/attr'
import { RpcError, type ArkivRpc } from '@asi/core'
import { asDashboard, asLink, asWidget, dashboardBundleExpr, jsonPayload, keysExprs, queryAll, widgetExtendExpr } from '../entities'
import { BLOCKS_PER_DAY, CONTENT_TYPE, DASH_PROJECT, MAX_LINKS_PER_DASHBOARD, MAX_REMAINING_DAYS, type Size, type WidgetPayload, type WriteResult } from '../schema'
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
    if (error instanceof Error && /EntityNotFound|EntityExpired|No live entity with key|entity 0x[\da-f]+ expired/i.test(error.message)) throw dashErrors.notFound()
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
