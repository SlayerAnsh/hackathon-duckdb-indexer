import { OFFICIAL_LOGIN, isOfficialUser, isOfficialOwned } from './official'
import { clampBlock, decodeAttribute, keyChunkQueries, type ArkivRpc, type RpcEntity, type RpcSelect } from '@asi/core'
import { addr, key } from '@arkiv-network/sdk/schema'
import { and, eq, or, render } from '@arkiv-network/sdk/query'
import { CHART_TYPES, DASH_PROJECT, LOGINS, isEntityKey, isHexAddress, parseDashboardPayload, parseLinkPayload, parseWidgetPayload, utf8Bytes,
  type ChartType, type DashboardPayload, type LinkPayload, type Login, type WidgetPayload } from './schema'

export type DashEntity = { key: string; owner: string; creator: string; createdAt: number; updatedAt: number; expiresAt: number; attrs: Record<string, string>; payload: unknown | null }
export type WidgetEntity = DashEntity & { kind: 'widget'; user: string; official: boolean; login: Login | typeof OFFICIAL_LOGIN; name: string; chart: ChartType; widget: WidgetPayload }
export type DashboardEntity = DashEntity & { kind: 'dashboard'; user: string; official: boolean; login: Login | typeof OFFICIAL_LOGIN; slug: string | null; cover: string | null; title: string; dashboard: DashboardPayload }
export type LinkEntity = DashEntity & { kind: 'link'; official: boolean; user: string; dashboardKey: string; widgetKey: string; link: LinkPayload }

export const DASH_SELECT: RpcSelect = { key: true, owner: true, creator: true, createdAt: true, updatedAt: true, expiresAt: true, attributes: true }
/** Name of the bytes attribute that holds each entity's JSON document (Rabdi has no entity payload). */
export const PAYLOAD_ATTR = 'payload'

export function decodeDashEntity(e: RpcEntity): DashEntity {
  if (e.key === undefined || e.owner === undefined || e.creator === undefined ||
    e.createdAt === undefined || e.updatedAt === undefined || e.expiresAt === undefined) throw new Error('Entity is missing required dashboard fields')
  const entityKey = e.key.toLowerCase()
  let payload: unknown | null = null
  try {
    const raw = (e.attributes ?? []).find(a => a.name === PAYLOAD_ATTR && a.type === 'bytes')?.value
    if (typeof raw !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(raw)) throw new Error('Invalid payload hex')
    const hex = raw.slice(2)
    const bytes = Uint8Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16))
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch { payload = null }
  return { key: entityKey, owner: e.owner.toLowerCase(), creator: e.creator.toLowerCase(),
    createdAt: clampBlock(e.createdAt), updatedAt: clampBlock(e.updatedAt), expiresAt: clampBlock(e.expiresAt),
    attrs: Object.fromEntries((e.attributes ?? []).filter(a => a.name !== PAYLOAD_ATTR).map(a => [a.name, decodeAttribute(entityKey, a).value])), payload }
}

function trusted(e: DashEntity, wallet: string, type: string): boolean {
  return e.creator === wallet.toLowerCase() && e.attrs.project === DASH_PROJECT && e.attrs.type === type &&
    typeof e.attrs.user === 'string' && isHexAddress(e.attrs.user)
}
function login(e: DashEntity, wallet: string): Login | typeof OFFICIAL_LOGIN | null {
  if (e.attrs.login === OFFICIAL_LOGIN && isOfficialUser(e.attrs.user ?? '', wallet)) return OFFICIAL_LOGIN
  return LOGINS.includes(e.attrs.login as Login) ? e.attrs.login as Login : null
}
function validName(value: string | undefined): value is string {
  return parseDashboardPayload({ v: 1, title: value }).ok
}
export function asWidget(e: DashEntity, wallet: string): WidgetEntity | null {
  const provider = login(e, wallet)
  if (!trusted(e, wallet, 'widget') || !provider || !validName(e.attrs.name) || !CHART_TYPES.includes(e.attrs.chart as ChartType)) return null
  const parsed = parseWidgetPayload(e.payload)
  if (!parsed.ok) return null
  return { ...e, kind: 'widget', official: isOfficialOwned(e.attrs.user!, e.owner, wallet), user: e.attrs.user!.toLowerCase(), login: provider, name: e.attrs.name, chart: parsed.value.chart, widget: parsed.value }
}
function dashboardSlug(value: string | undefined): string | null {
  return value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && utf8Bytes(value) <= 64 ? value : null
}
export function asDashboard(e: DashEntity, wallet: string): DashboardEntity | null {
  const provider = login(e, wallet)
  if (!trusted(e, wallet, 'dashboard') || !provider || !validName(e.attrs.title)) return null
  const parsed = parseDashboardPayload(e.payload)
  if (!parsed.ok) return null
  return { ...e, kind: 'dashboard', official: isOfficialOwned(e.attrs.user!, e.owner, wallet), slug: dashboardSlug(e.attrs.slug), cover: isEntityKey(e.attrs.cover ?? "") ? e.attrs.cover.toLowerCase() : null, user: e.attrs.user!.toLowerCase(), login: provider, title: e.attrs.title, dashboard: parsed.value }
}
export function asLink(e: DashEntity, wallet: string): LinkEntity | null {
  if (!trusted(e, wallet, 'link') || !isEntityKey(e.attrs.dashboard ?? '') || !isEntityKey(e.attrs.widget ?? '')) return null
  const parsed = parseLinkPayload(e.payload)
  if (!parsed.ok) return null
  return { ...e, kind: 'link', official: isOfficialOwned(e.attrs.user!, e.owner, wallet), user: e.attrs.user!.toLowerCase(), dashboardKey: e.attrs.dashboard!.toLowerCase(), widgetKey: e.attrs.widget!.toLowerCase(), link: parsed.value }
}

const scope = (wallet: string) => and(eq('$creator', addr(wallet.toLowerCase() as `0x${string}`)), eq('project', DASH_PROJECT))
export function scopeExpr(wallet: string): string { return render(scope(wallet)) }
export function dashboardBundleExpr(wallet: string, dashboardKey: string, extraKeys: string[] = []): string {
  return render(and(scope(wallet), or(eq('$key', key(dashboardKey as `0x${string}`)),
    ...extraKeys.map(k => eq('$key', key(k as `0x${string}`))), and(eq('type', 'link'), eq('dashboard', key(dashboardKey as `0x${string}`))))))
}
export function widgetVersionExpr(wallet: string, widgetKey: string, caller: string): string {
  return render(and(scope(wallet), or(eq('$key', key(widgetKey as `0x${string}`)),
    and(eq('type', 'link'), eq('widget', key(widgetKey as `0x${string}`)), eq('user', addr(caller as `0x${string}`))))))
}
export function keysExprs(wallet: string, keys: string[]): string[] { return keyChunkQueries(scopeExpr(wallet), keys) }
// Rabdi caps a page at 100 and binds a cursor to one block it does not retain, so results page by key order.
export const DASH_PAGE = 100
export function keysetExpr(expression: string, after: string | null): string {
  return '(' + (expression.trim() || '*') + ')' + (after ? ' AND $key > key(' + after + ')' : '') + ' ORDER BY $key:key ASC'
}
export async function queryAll(rpc: Pick<ArkivRpc, 'query'>, expression: string): Promise<{ head: number; entities: DashEntity[] }> {
  const entities: DashEntity[] = []
  let after: string | null = null
  let head: number | undefined
  for (;;) {
    const page = await rpc.query(keysetExpr(expression, after), { limit: DASH_PAGE, select: DASH_SELECT })
    head ??= page.blockNumber
    entities.push(...page.data.map(decodeDashEntity))
    if (page.data.length < DASH_PAGE) break
    const last = entities[entities.length - 1]!.key
    if (after !== null && last <= after) throw new Error('Dashboard query did not advance')
    after = last
  }
  return { head: head!, entities }
}
export function jsonPayload(value: object): Uint8Array { return new TextEncoder().encode(JSON.stringify(value)) }
