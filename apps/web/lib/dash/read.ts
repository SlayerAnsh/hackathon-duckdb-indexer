import type { ArkivRpc } from '@asi/core'
import { asDashboard, asLink, asWidget, dashboardBundleExpr, keysExprs, queryAll,
  type WidgetEntity, type DashboardEntity, type LinkEntity } from './entities'

type Rpc = Pick<ArkivRpc, 'query'>

export async function fetchWidget(rpc: Rpc, wallet: string, key: string): Promise<{ head: number; widget: WidgetEntity | null }> {
  const { head, widgets } = await fetchWidgets(rpc, wallet, [key])
  return { head, widget: widgets.get(key.toLowerCase()) ?? null }
}

export async function fetchWidgets(rpc: Rpc, wallet: string, keys: string[]): Promise<{ head: number; widgets: Map<string, WidgetEntity> }> {
  const wanted = new Set(keys.map(key => key.toLowerCase()))
  const widgets = new Map<string, WidgetEntity>()
  let head = 0
  let first = true
  for (const expression of keysExprs(wallet, [...wanted])) {
    const result = await queryAll(rpc, expression)
    if (first) { head = result.head; first = false }
    for (const entity of result.entities) {
      const widget = asWidget(entity, wallet)
      if (widget && wanted.has(widget.key)) widgets.set(widget.key, widget)
    }
  }
  return { head, widgets }
}

export async function fetchDashboardBundle(rpc: Rpc, wallet: string, key: string): Promise<{ head: number; dashboard: DashboardEntity | null; links: LinkEntity[] }> {
  const { head, entities } = await queryAll(rpc, dashboardBundleExpr(wallet, key))
  const dashboardKey = key.toLowerCase()
  let dashboard: DashboardEntity | null = null
  const links: LinkEntity[] = []
  for (const entity of entities) {
    if (entity.key === dashboardKey) dashboard = asDashboard(entity, wallet)
    const link = asLink(entity, wallet)
    if (link?.dashboardKey === dashboardKey) links.push(link)
  }
  links.sort((a, b) => a.link.position - b.link.position || a.key.localeCompare(b.key))
  return { head, dashboard, links }
}
