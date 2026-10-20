'use client'
import { QueryClient, useQuery, useQueries, useQueryClient, useIsRestoring, type Query } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import { RpcError } from '@asi/core'
import { useDashAuth } from '../../components/auth/DashAuthProvider'
import { rpcMessage } from '../../components/RowActions'
import { createBrowserRpc } from '../rpc-browser'
import { fetchWidgets, fetchDashboards, fetchDashboardBundle } from './read'
import type { WidgetEntity, DashboardEntity } from './entities'
import { dashboardWidgetRevsSql } from './sql'
import { useIndex } from '../use-index'
import { useTimedQuery } from '../use-query'
import { isEntityKey } from './schema'
export const ENTITY_CACHE_VERSION = 'v1'
export const CACHE_AGE = 86400000
export type Rev = string
export const entityRev = (e: { updatedAt: number; expiresAt: number; owner: string }): Rev => `${e.updatedAt}:${e.expiresAt}:${e.owner.toLowerCase()}`
const keyFor = (kind: string, wallet: string, key: string) => ['arkiv', kind, wallet.toLowerCase(), key.toLowerCase()] as const
export const entityKeys = { widget: (w: string,k: string) => keyFor('widget',w,k), dashboard: (w: string,k: string) => keyFor('dashboard',w,k), bundle: (w: string,k: string) => keyFor('bundle',w,k) }
type Entry = { value: unknown | null; rev?: Rev; afterBlock?: number; deleted?: boolean }
export const isLimited = (error: unknown) => error instanceof RpcError && (rpcMessage(error) !== String(error) || /quota|budget|rate.?limit/i.test(error.message))
export const entityDefaults = { staleTime: Infinity, gcTime: CACHE_AGE, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: (count: number,error: unknown) => count < 2 && !isLimited(error) }
export const shouldPersistEntity = (query: Query) => query.queryKey[0] === 'arkiv' && query.state.status === 'success'
export function createEntityLoader(opts: { client: QueryClient; fetchMany(keys: string[]): Promise<Map<string, unknown>>; kind: 'widget' | 'dashboard'; wallet: string; schedule?(fn: () => void): void }) {
 const pending = new Map<string, Promise<unknown | null>>()
 let batch = new Map<string, { resolve(value: unknown | null): void; reject(error: unknown): void }>()
 function flush() {
  const current = batch; batch = new Map()
  void opts.fetchMany([...current.keys()]).then(values => {
   for (const [key, waiter] of current) {
    let value: unknown | null = values.get(key) ?? null
    const previous = opts.client.getQueryData<Entry>(entityKeys[opts.kind](opts.wallet,key))
    // Replicas can lag a confirmed write. Keep its known state until a newer entity arrives.
    const lagging = previous?.afterBlock !== undefined && (!value || (value as WidgetEntity).updatedAt <= previous.afterBlock)
    if (lagging) value = previous.value
    const entry: Entry = { value, rev: value ? entityRev(value as WidgetEntity) : undefined, ...(lagging ? {afterBlock:previous.afterBlock,deleted:previous.deleted} : {}) }
    opts.client.setQueryData(entityKeys[opts.kind](opts.wallet,key), entry)
    pending.delete(key); waiter.resolve(value)
   }
  }).catch(error => { for (const [key, waiter] of current) { pending.delete(key); waiter.reject(error) } })
 }
 return { async load(keys: string[], want?: Map<string, Rev>): Promise<Map<string, unknown | null>> {
  const pairs = keys.map(raw => {
   const key = raw.toLowerCase(), queryKey = entityKeys[opts.kind](opts.wallet,key)
   const state = opts.client.getQueryState<Entry>(queryKey), entry = state?.data
   if (entry && !state?.isInvalidated && (!want?.has(key) || entry.rev === want.get(key))) return Promise.resolve([key,entry.value] as const)
   let promise = pending.get(key)
   if (!promise) {
    promise = new Promise((resolve,reject) => { batch.set(key,{resolve,reject}) }); pending.set(key,promise)
    if (batch.size === 1) (opts.schedule ?? queueMicrotask)(flush)
   }
   return promise.then(value => [key,value] as const)
  })
  return new Map(await Promise.all(pairs))
 } }
}
const loaders = new WeakMap<QueryClient, Map<string, ReturnType<typeof createEntityLoader>>>()
function loaderFor(client: QueryClient, wallet: string, url: string, kind: 'widget' | 'dashboard') {
 let group = loaders.get(client); if (!group) { group = new Map(); loaders.set(client,group) }
 const id = `${wallet.toLowerCase()}:${url}:${kind}`
 let loader = group.get(id)
 if (!loader) { loader = createEntityLoader({client,wallet,kind,fetchMany: async keys => {
  const rpc = createBrowserRpc(url)
  return kind === 'widget' ? (await fetchWidgets(rpc,wallet,keys)).widgets : (await fetchDashboards(rpc,wallet,keys)).dashboards
 }}); group.set(id,loader) }
 return loader
}
export function invalidateEntity(client: QueryClient, wallet: string, kind: 'widget' | 'dashboard' | 'bundle', key: string): Promise<void> {
 return client.invalidateQueries({queryKey:entityKeys[kind](wallet,key),exact:true})
}
export function patchCachedWidget(client: QueryClient,wallet: string,key: string,patch: Partial<WidgetEntity>) {
 client.setQueryData<Entry>(entityKeys.widget(wallet,key), old => old?.value ? { ...old, value:{...old.value as WidgetEntity,...patch} } : old)
}
function useEntities<T>(kind: 'widget' | 'dashboard', keys: string[], revs?: Map<string,Rev>, single = false, interval?: () => number | false) {
 const {config} = useDashAuth(), client = useQueryClient()
 const restoring = useIsRestoring()
 const wallet = config?.wallet ?? '', url = config?.rpcUrl ?? ''
 const normalized = [...new Set(keys.map(k=>k.toLowerCase()))]
 const loader = useMemo(()=>loaderFor(client,wallet,url,kind),[client,wallet,url,kind])
 const results = useQueries({queries:normalized.map(key => ({
  ...entityDefaults, queryKey:entityKeys[kind](wallet,key), enabled:!!config?.enabled && isEntityKey(key),
  staleTime: (query: Query) => revs?.has(key) && query.state.data && (query.state.data as Entry).rev !== revs.get(key) ? 0 : single ? 60000 : Infinity,
  queryFn:async () => {
   // A query function is running because it was invalidated, is missing or needs revalidation.
   await client.invalidateQueries({queryKey:entityKeys[kind](wallet,key),exact:true,refetchType:'none'})
   await loader.load([key],revs)
   return client.getQueryData<Entry>(entityKeys[kind](wallet,key))!
  }, refetchInterval: interval ? () => interval() : false,
 }))})
 const revisionSignature = normalized.map(key => `${key}:${revs?.get(key) ?? ''}`).join(',')
 useEffect(() => {
  if (restoring || !config?.enabled) return
  for (const key of normalized) {
   const state = client.getQueryState<Entry>(entityKeys[kind](wallet,key))
   if (state?.data && revs?.has(key) && state.data.rev !== revs.get(key) && state.fetchStatus !== 'fetching') void invalidateEntity(client,wallet,kind,key)
  }
 }, [client,wallet,kind,revisionSignature,restoring,config?.enabled])
 const error = results.find(r=>r.error)?.error
 let data = results.every(r=>r.data !== undefined) ? new Map(normalized.map((key,i)=>[key,results[i].data!.value as T | null])) : undefined
 const previous = useRef<{scope: string; data: Map<string,T | null>}>({scope:'',data:new Map()})
 const scope = `${wallet}:${url}:${kind}`
 if(data) previous.current = {scope,data}
 else if(previous.current.scope === scope && previous.current.data.size) data = previous.current.data
 else if(error) data = new Map(normalized.map((key,i)=>[key,(results[i].data?.value ?? null) as T | null]))
 return {data,error:error ? rpcMessage(error) : undefined,limited:isLimited(error), refetch:()=>{ for(const r of results) void r.refetch() }, attempts:Math.max(results[0]?.dataUpdatedAt ?? 0, results[0]?.errorUpdatedAt ?? 0)}
}
export const useWidgetEntities = (keys: string[],revs?: Map<string,Rev>) => useEntities<WidgetEntity>('widget',keys,revs)
export const useDashboardEntities = (keys: string[],revs?: Map<string,Rev>) => useEntities<DashboardEntity>('dashboard',keys,revs)
export function useWidgetEntity(key: string | null, interval?: () => number | false) {
 const result = useEntities<WidgetEntity>('widget',key ? [key] : [],undefined,true,interval)
 return {...result,data:key ? result.data?.get(key.toLowerCase()) : null}
}
export function useDashboardBundle(key: string | null) {
 const {config} = useDashAuth()
 const query = useQuery({...entityDefaults,queryKey:entityKeys.bundle(config?.wallet ?? '',key ?? ''),enabled:!!config?.enabled && !!key && isEntityKey(key),staleTime:30000,
  queryFn:()=>fetchDashboardBundle(createBrowserRpc(config!.rpcUrl),config!.wallet,key!)})
 const {version} = useIndex()
 const rows = useTimedQuery(config?.enabled && key && isEntityKey(key) ? dashboardWidgetRevsSql(config.wallet,key) : '',version,{skip:!config?.enabled || !key || !isEntityKey(key)})
 const revs = new Map((rows.data?.rows ?? []).map(([k,updatedAt,expiresAt,owner])=>[String(k).toLowerCase(),entityRev({updatedAt:Number(updatedAt),expiresAt:Number(expiresAt),owner:String(owner)})]))
 const widgets = useWidgetEntities(query.data?.links.map(l=>l.widgetKey) ?? [],revs)
 const error = query.error ? rpcMessage(query.error) : widgets.error
 return {status: query.data ? query.data.dashboard ? 'ready' as const : 'missing' as const : error ? 'error' as const : 'loading' as const,
  head:query.data?.head,dashboard:query.data?.dashboard ?? null,links:query.data?.links ?? [],widgets:widgets.data ? new Map([...widgets.data].filter((pair): pair is [string,WidgetEntity]=>pair[1] !== null)) : null,error,
  refetch:()=>{void query.refetch();widgets.refetch()}}
}
