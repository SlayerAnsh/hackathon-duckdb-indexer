'use client'
import { useEffect, useState } from 'react'
import type { WidgetEntity } from './entities'
import { fetchWidgets } from './read'
import { createBrowserRpc } from '../rpc-browser'
import { useDashAuth } from '../../components/auth/DashAuthProvider'
export function useCoverPayloads(items: { cover?: string | null }[]): Map<string, WidgetEntity> | undefined {
 const { config } = useDashAuth()
 const keys = [...new Set(items.flatMap(item => item.cover ? [item.cover] : []))].sort().join(',')
 const scope = `${config?.wallet}:${config?.rpcUrl}:${keys}`
 const [record, setRecord] = useState<{ scope: string; widgets: Map<string, WidgetEntity> }>()
 useEffect(() => {
  if (!config?.enabled || !keys) return
  let active = true
  void fetchWidgets(createBrowserRpc(config.rpcUrl), config.wallet, keys.split(',')).then(result => {
   if (active) setRecord({ scope, widgets: result.widgets })
  }).catch(() => { if (active) setRecord({ scope, widgets: new Map() }) })
  return () => { active = false }
 }, [config?.enabled, config?.wallet, config?.rpcUrl, keys, scope])
 return record?.scope === scope ? record.widgets : undefined
}
