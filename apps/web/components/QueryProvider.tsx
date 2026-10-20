'use client'
import { useEffect, useState } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { CACHE_AGE, ENTITY_CACHE_VERSION, entityDefaults, entityKeys, invalidateEntity, patchCachedWidget, shouldPersistEntity } from '../lib/dash/entity-cache'
import { createIdbPersister } from '../lib/dash/query-persist'
import { onPendingWrite } from '../lib/dash/pending'
export function QueryProvider({children}: {children: React.ReactNode}) {
 const [client] = useState(()=>new QueryClient({defaultOptions:{queries:entityDefaults}}))
 const [persister] = useState(()=>createIdbPersister())
 useEffect(()=>onPendingWrite(write=>{
  const wallets = new Set(client.getQueryCache().getAll().filter(q=>q.queryKey[0]==='arkiv').map(q=>String(q.queryKey[2])))
  for(const wallet of wallets) {
   if(write.kind==='widget') {
    if(write.op==='delete') client.setQueryData(entityKeys.widget(wallet,write.key),{value:null})
    else patchCachedWidget(client,wallet,write.key,{...write.fields, ...(write.widgetPayload ? {widget:write.widgetPayload,payload:write.widgetPayload} : {})})
    client.setQueryData<{value: unknown; rev?: string}>(entityKeys.widget(wallet,write.key), old => old ? {...old,afterBlock:write.afterBlock,deleted:write.op==='delete'} : old)
    void invalidateEntity(client,wallet,'widget',write.key)
   }
   // Links and widget versions can affect several dashboards; invalidate their public metadata and bundles.
   for(const query of client.getQueryCache().getAll()) if(query.queryKey[0]==='arkiv' && query.queryKey[2]===wallet && (query.queryKey[1]==='bundle' || query.queryKey[1]==='dashboard')) void invalidateEntity(client,wallet,query.queryKey[1],String(query.queryKey[3]))
  }
 }),[client])
 return <PersistQueryClientProvider client={client} persistOptions={{persister,maxAge:CACHE_AGE,buster:ENTITY_CACHE_VERSION,dehydrateOptions:{shouldDehydrateQuery:shouldPersistEntity}}}>{children}</PersistQueryClientProvider>
}
