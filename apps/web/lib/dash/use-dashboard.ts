'use client'
import type { DashboardEntity, LinkEntity, WidgetEntity } from './entities'
import { useDashboardBundle } from './entity-cache'

export type DashboardData = { status: 'loading' | 'missing' | 'ready' | 'error'; head?: number; dashboard: DashboardEntity | null; links: LinkEntity[]; widgets: Map<string, WidgetEntity> | null; error?: string; reload(): void }
export function useDashboard(key: string): DashboardData {
 const data = useDashboardBundle(key.toLowerCase())
 return { ...data, reload: data.refetch }
}
