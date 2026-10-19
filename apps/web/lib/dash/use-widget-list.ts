'use client'
import { useEffect, useState } from 'react'
import { useDashAuth } from '../../components/auth/DashAuthProvider'
import { rpcMessage } from '../../components/RowActions'
import { createBrowserRpc } from '../rpc-browser'
import { useTimedQuery } from '../use-query'
import type { WidgetEntity } from './entities'
import { fetchWidgets } from './read'
import { widgetListSql, widgetCountSql, type WidgetListQuery, type WidgetListItem } from './sql'
export type { WidgetListQuery, WidgetListItem } from './sql'

export function toListItems(rows: unknown[][]): WidgetListItem[] {
 return rows.map(([key, name, chart, user, expiresAt, createdAt, owner, uses]) => ({ key: String(key).toLowerCase(), name: String(name), chart: chart as WidgetListItem['chart'], user: String(user).toLowerCase(), owner: String(owner).toLowerCase(), expiresAt: Number(expiresAt), createdAt: Number(createdAt), uses: Number(uses) }))
}

export function useWidgetList(q: WidgetListQuery, version: number): { items: WidgetListItem[]; total: number | null; loading: boolean; error?: string; payloads: Map<string, WidgetEntity> | undefined; payloadError?: string } {
 const { config } = useDashAuth()
 const enabled = !!config?.enabled
 const list = useTimedQuery(enabled ? widgetListSql(config.wallet, q) : '', version, { skip: !enabled })
 const count = useTimedQuery(enabled ? widgetCountSql(config.wallet, q) : '', version, { skip: !enabled })
 const items = toListItems(list.data?.rows ?? [])
 const keys = items.map(item => item.key).join(',')
 const scope = `${config?.wallet}:${config?.rpcUrl}:${keys}`
 const [record, setRecord] = useState<{ scope: string; payloads?: Map<string, WidgetEntity>; error?: string } | null>(null)
 useEffect(() => {
  if (!config?.enabled) return
  let active = true
  setRecord(null)
  void fetchWidgets(createBrowserRpc(config.rpcUrl), config.wallet, keys ? keys.split(',') : []).then(result => {
   if (active) setRecord({ scope, payloads: result.widgets })
  }).catch(error => { if (active) setRecord({ scope, payloads: new Map(), error: rpcMessage(error) }) })
  return () => { active = false }
 }, [config?.enabled, config?.wallet, config?.rpcUrl, keys, scope])
 const current = record?.scope === scope ? record : null
 return { items, total: count.data ? Number(count.data.rows[0]?.[0] ?? 0) : null, loading: list.loading || count.loading,
  error: list.error ?? count.error, payloads: current?.payloads, payloadError: current?.error }
}
