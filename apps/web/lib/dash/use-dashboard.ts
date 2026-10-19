'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDashAuth } from '../../components/auth/DashAuthProvider'
import { rpcMessage } from '../../components/RowActions'
import { createBrowserRpc } from '../rpc-browser'
import type { DashboardEntity, LinkEntity, WidgetEntity } from './entities'
import { usePending } from './pending'
import { fetchDashboardBundle, fetchWidgets } from './read'
import { isEntityKey } from './schema'

export type DashboardData = { status: 'loading' | 'missing' | 'ready' | 'error'; head?: number; dashboard: DashboardEntity | null; links: LinkEntity[]; widgets: Map<string, WidgetEntity> | null; error?: string; reload(): void }
const initial = { status: 'loading' as const, dashboard: null, links: [], widgets: null }

export function useDashboard(key: string): DashboardData {
 const dashboardKey = key.toLowerCase()
 const { config } = useDashAuth()
 const pending = usePending()
 const write = pending.find(entry => entry.key === dashboardKey && entry.kind === 'dashboard')
 const lastWrite = useRef(write)
 const [revision, setRevision] = useState(0)
 const reload = useCallback(() => setRevision(value => value + 1), [])
 const scope = `${config?.wallet}:${config?.rpcUrl}:${dashboardKey}`
 const [record, setRecord] = useState<{ scope: string; data: Omit<DashboardData, 'reload'> } | null>(null)
 useEffect(() => {
  if (write && write !== lastWrite.current) reload()
  lastWrite.current = write
 }, [write, reload])
 useEffect(() => {
  let active = true
  if (!config?.enabled) return
  if (!isEntityKey(dashboardKey)) {
   setRecord({ scope, data: { ...initial, status: 'missing' } })
   return
  }
  setRecord({ scope, data: initial })
  const rpc = createBrowserRpc(config.rpcUrl)
  void (async () => {
   const bundle = await fetchDashboardBundle(rpc, config.wallet, dashboardKey)
   if (!active) return
   if (!bundle.dashboard) {
    setRecord({ scope, data: { ...initial, ...bundle, status: 'missing' } })
    return
   }
   setRecord({ scope, data: { ...bundle, widgets: null, status: 'ready' } })
   const result = await fetchWidgets(rpc, config.wallet, [...new Set(bundle.links.map(link => link.widgetKey))])
   if (active) setRecord({ scope, data: { ...bundle, head: Math.max(bundle.head, result.head), widgets: result.widgets, status: 'ready' } })
  })().catch(error => {
   if (active) setRecord({ scope, data: { ...initial, status: 'error', error: rpcMessage(error) } })
  })
  return () => { active = false }
 }, [dashboardKey, config?.enabled, config?.wallet, config?.rpcUrl, scope, revision])
 return { ...(record?.scope === scope ? record.data : initial), reload }
}
