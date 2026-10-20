import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
export function createIdbPersister(opts: { dbName?: string; storeName?: string; key?: string } = {}): Persister {
 const {dbName='arkiv-entities',storeName='cache',key='client'} = opts
 async function run(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  try {
   if (typeof indexedDB === 'undefined') return undefined
   return await new Promise(resolve => {
    let db: IDBDatabase | undefined; let value: unknown
    const done = () => { db?.close(); resolve(value) }
    const open = indexedDB.open(dbName,1)
    open.onupgradeneeded = () => { try { if(!open.result.objectStoreNames.contains(storeName)) open.result.createObjectStore(storeName) } catch { open.transaction?.abort(); resolve(undefined) } }
    open.onerror = () => resolve(undefined); open.onblocked = () => resolve(undefined)
    open.onsuccess = () => {
     db = open.result
     try { const tx = db.transaction(storeName,mode); const request = action(tx.objectStore(storeName)); request.onsuccess = () => {value=request.result}; tx.oncomplete=done; tx.onerror=()=>{value=undefined;done()}; tx.onabort=()=>{value=undefined;done()} } catch {done()}
    }
   })
  } catch { return undefined }
 }
 return {persistClient:async client=>{await run('readwrite',store=>store.put(client,key))},restoreClient:async()=>await run('readonly',store=>store.get(key)) as PersistedClient | undefined,removeClient:async()=>{await run('readwrite',store=>store.delete(key))}}
}
