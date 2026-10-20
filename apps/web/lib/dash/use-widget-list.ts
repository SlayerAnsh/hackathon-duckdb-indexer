'use client'
import { useDashAuth } from '../../components/auth/DashAuthProvider'
import { useTimedQuery } from '../use-query'
import type { WidgetEntity } from './entities'
import { useWidgetEntities, entityRev } from './entity-cache'
import { widgetListSql, widgetCountSql, type WidgetListQuery, type WidgetListItem } from './sql'
export type { WidgetListQuery, WidgetListItem } from './sql'

export function toListItems(rows: unknown[][]): WidgetListItem[] {
 return rows.map(([key, name, chart, user, expiresAt, createdAt, owner, uses, updatedAt]) => ({ key: String(key).toLowerCase(), name: String(name), chart: chart as WidgetListItem['chart'], user: String(user).toLowerCase(), owner: String(owner).toLowerCase(), expiresAt: Number(expiresAt), createdAt: Number(createdAt), uses: Number(uses), updatedAt: Number(updatedAt ?? 0) }))
}

export function useWidgetList(q: WidgetListQuery, version: number): { items: WidgetListItem[]; total: number | null; loading: boolean; error?: string; payloads: Map<string, WidgetEntity> | undefined; payloadError?: string } {
 const { config } = useDashAuth()
 const enabled = !!config?.enabled
 const list = useTimedQuery(enabled ? widgetListSql(config.wallet, q) : '', version, { skip: !enabled })
 const count = useTimedQuery(enabled ? widgetCountSql(config.wallet, q) : '', version, { skip: !enabled })
 const items = toListItems(list.data?.rows ?? [])
 const entities = useWidgetEntities(items.map(item => item.key), new Map(items.map(item => [item.key, entityRev(item)])))
 return { items, total: count.data ? Number(count.data.rows[0]?.[0] ?? 0) : null, loading: list.loading || count.loading,
  error: list.error ?? count.error, payloads: entities.data ? new Map([...entities.data].filter((pair): pair is [string, WidgetEntity] => pair[1] !== null)) : undefined, payloadError: entities.error }
}
