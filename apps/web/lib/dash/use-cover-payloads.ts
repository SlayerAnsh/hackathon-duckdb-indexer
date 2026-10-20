'use client'
import type { WidgetEntity } from './entities'
import { useWidgetEntities } from './entity-cache'
export function useCoverPayloads(items: { cover?: string | null }[]): Map<string, WidgetEntity> | undefined {
 const result = useWidgetEntities([...new Set(items.flatMap(item => item.cover ? [item.cover] : []))])
 return result.data ? new Map([...result.data].filter((pair): pair is [string, WidgetEntity] => pair[1] !== null)) : undefined
}
