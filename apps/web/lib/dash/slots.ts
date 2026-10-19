import type { LinkEntity, WidgetEntity } from './entities'
import type { Size } from './schema'

export type SlotStatus = 'loading' | 'live' | 'expired'
export type Slot = { id: string; linkKey: string; widgetKey: string; name: string; size: Size; status: SlotStatus; widget: WidgetEntity | null }

export function dashboardSlots(links: LinkEntity[], widgets: Map<string, WidgetEntity> | null): Slot[] {
 return links.map(link => {
  const widget = widgets?.get(link.widgetKey) ?? null
  return { id: link.key, linkKey: link.key, widgetKey: link.widgetKey, name: link.link.name, size: link.link.size,
   status: widgets === null ? 'loading' : widget ? 'live' : 'expired', widget }
 })
}
