import { DEFAULT_RPC_URL } from '../../chain'
import { ExpirationTime, type AttributeInputs } from '@arkiv-network/sdk'
import { addr, key } from '@arkiv-network/sdk/attr'
import { privateKeyToAccount } from 'viem/accounts'
import { asDashboard, asLink, asWidget, jsonPayload, queryAll } from '../entities'
import { OFFICIAL_DASHBOARDS, type OfficialDashboardDef } from '../official-defs'
import { isOfficialOwned, officialExpr, OFFICIAL_KEEP_DAYS, OFFICIAL_LOGIN } from '../official'
import { BLOCKS_PER_DAY, CONTENT_TYPE, DASH_PROJECT, MAX_LINKS_PER_DASHBOARD, MAX_REMAINING_DAYS, SIZES, parseDashboardPayload, parseWidgetPayload, utf8Bytes } from '../schema'
import { read, write, type OpsDeps } from './operations'

export type SeedResult = { created: { slug: string; key: string; txHash: string }[]; skipped: string[] }
export type KeepaliveResult = { checked: number; extended: number; txHashes: string[] }
const hex = (s: string) => s.toLowerCase() as `0x${string}`

// Shared with the CLI so a dry run validates the entire input before querying.
export function validateOfficialDefinitions(defs: OfficialDashboardDef[]): OfficialDashboardDef[] {
  const slugs = new Set<string>()
  return defs.map(def => {
    const fail = () => new Error(`Invalid official dashboard definition: ${def.slug}`)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(def.slug) || utf8Bytes(def.slug) > 64 || slugs.has(def.slug)) throw fail()
    slugs.add(def.slug)
    const dashboard = parseDashboardPayload({ v: 1, title: def.title, description: def.description })
    if (!dashboard.ok || !Array.isArray(def.widgets) || def.widgets.length > MAX_LINKS_PER_DASHBOARD) throw fail()
    if (def.cover !== undefined && (!Number.isInteger(def.cover) || def.cover < 0 || def.cover >= def.widgets.length)) throw fail()
    const widgets = def.widgets.map(item => {
      const parsed = parseWidgetPayload(item.widget)
      if (!parsed.ok || !SIZES.includes(item.size)) throw fail()
      return { size: item.size, widget: parsed.value }
    })
    return { slug: def.slug, title: dashboard.value.title, description: dashboard.value.description, ...(def.cover === undefined ? {} : { cover: def.cover }), widgets }
  })
}

export async function officialDashboardExists(deps: OpsDeps, slug: string): Promise<boolean> {
  const { head, entities } = await read(() => queryAll(deps.reader, officialExpr(deps.wallet)))
  return entities.some(e => {
    const dashboard = e.expiresAt > head ? asDashboard(e, deps.wallet) : null
    return dashboard?.official === true && dashboard.slug === slug
  })
}

export async function seedOfficial(deps: OpsDeps, defs = OFFICIAL_DASHBOARDS): Promise<SeedResult> {
  const validated = validateOfficialDefinitions(defs)
  const result: SeedResult = { created: [], skipped: [] }
  for (const def of validated) await deps.queue.run(async () => {
    if (await officialDashboardExists(deps, def.slug)) { result.skipped.push(def.slug); return }
    const n = def.widgets.length
    const predicted = await read(() => deps.client.predictEntityKeys({ owner: deps.client.account!.address, count: 1 + 2 * n }))
    const common = { project: DASH_PROJECT, user: addr(hex(deps.wallet)) }
    const create = (index: number, attributes: AttributeInputs, payload: object) => ({ salt: predicted[index].salt, attributes,
      payload: jsonPayload(payload), contentType: CONTENT_TYPE, expires: ExpirationTime.fromSeconds(90 * 86400) })
    const creates = [create(0, { ...common, type: 'dashboard', login: OFFICIAL_LOGIN, title: def.title, slug: def.slug, ...(def.cover === undefined ? {} : { cover: key(predicted[1 + def.cover].key) }) }, { v: 1, title: def.title, description: def.description }),
      ...def.widgets.map(({ widget }, i) => create(1 + i, { ...common, type: 'widget', login: OFFICIAL_LOGIN, name: widget.name, chart: widget.chart }, widget)),
      ...def.widgets.map(({ widget, size }, i) => create(1 + n + i, { ...common, type: 'link', dashboard: key(predicted[0].key), widget: key(predicted[1 + i].key) }, { v: 1, size, position: i, name: widget.name }))]
    const tx = await write(() => deps.client.executeBatch({ creates }))
    result.created.push({ slug: def.slug, key: predicted[0].key, txHash: tx.txHash })
  })
  return result
}


/** Reconcile official covers by definition and live links; caller holds the writer queue. */
async function reconcileOfficialCovers(deps: OpsDeps, dryRun: boolean, snapshot?: Awaited<ReturnType<typeof queryAll>>): Promise<number> {
 const { head, entities } = snapshot ?? await read(() => queryAll(deps.reader, officialExpr(deps.wallet)))
 const live = entities.filter(e => e.expiresAt > head)
 const widgets = new Map(live.map(e => asWidget(e, deps.wallet)).filter(w => w !== null).map(w => [w.key, w]))
 const links = live.map(e => asLink(e, deps.wallet)).filter(l => l !== null)
 const patches: { entityKey: `0x${string}`; set: { cover: ReturnType<typeof key> } }[] = []
 for (const entity of live) {
  const dashboard = asDashboard(entity, deps.wallet)
  if (!dashboard?.official) continue
  const def = OFFICIAL_DASHBOARDS.find(d => d.slug === dashboard.slug)
  if (!def || def.cover === undefined) continue
  const name = def.widgets[def.cover].widget.name
  const candidates = links.filter(l => l.dashboardKey === dashboard.key && l.user === dashboard.user && widgets.get(l.widgetKey)?.name === name).sort((a,b) => a.link.position - b.link.position || a.key.localeCompare(b.key))
  const cover = candidates[0]?.widgetKey
  if (cover && cover !== dashboard.cover) patches.push({ entityKey: hex(dashboard.key), set: { cover: key(hex(cover)) } })
 }
 if (!dryRun) for (let i = 0; i < patches.length; i += 50) await write(() => deps.client.executeBatch({ patches: patches.slice(i, i + 50) }))
 return patches.length
}
export function setOfficialCovers(deps: OpsDeps, opts: { dryRun?: boolean } = {}): Promise<number> {
 return deps.queue.run(() => reconcileOfficialCovers(deps, !!opts.dryRun))
}

export function keepOfficialAlive(deps: OpsDeps, { keepDays = OFFICIAL_KEEP_DAYS }: { keepDays?: number } = {}): Promise<KeepaliveResult> {
  return deps.queue.run(async () => {
    const { head, entities } = await read(() => queryAll(deps.reader, officialExpr(deps.wallet)))
    const live = entities.filter(e => e.expiresAt > head && e.creator === deps.wallet.toLowerCase() && e.attrs.project === DASH_PROJECT && isOfficialOwned(e.attrs.user, e.owner, deps.wallet))
    const target = head + MAX_REMAINING_DAYS * BLOCKS_PER_DAY
    const due = live.filter(e => e.expiresAt < head + keepDays * BLOCKS_PER_DAY && e.expiresAt < target)
    const result: KeepaliveResult = { checked: live.length, extended: 0, txHashes: [] }
    for (let i = 0; i < due.length; i += 50) {
      const extensions = due.slice(i, i + 50).map(e => ({ entityKey: hex(e.key), expires: ExpirationTime.atBlock(BigInt(target)) }))
      const tx = await write(() => deps.client.executeBatch({ extensions }))
      result.extended += extensions.length
      result.txHashes.push(tx.txHash)
    }
    await reconcileOfficialCovers(deps, false, { head, entities })
    return result
  })
}

export function readOfficialEnv(env: Record<string, string | undefined>): { ok: true; privateKey: `0x${string}`; wallet: string; rpcUrl: string } | { ok: false; reason: string } {
  const privateKey = env.DASHBOARD_PRIVATE_KEY
  if (!privateKey) return { ok: false, reason: 'DASHBOARD_PRIVATE_KEY is required' }
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) return { ok: false, reason: 'DASHBOARD_PRIVATE_KEY must be a 32 byte hex key' }
  try {
    const wallet = privateKeyToAccount(privateKey as `0x${string}`).address.toLowerCase()
    return { ok: true, privateKey: privateKey as `0x${string}`, wallet, rpcUrl: env.NEXT_PUBLIC_ARKIV_RPC_URL?.trim() || DEFAULT_RPC_URL }
  } catch { return { ok: false, reason: 'DASHBOARD_PRIVATE_KEY is invalid' } }
}
