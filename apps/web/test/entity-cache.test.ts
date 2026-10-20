import { expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { bundleStatus, createEntityLoader, entityKeys, entityRev, invalidateEntity, shouldPersistEntity } from '../lib/dash/entity-cache'
import { createIdbPersister } from '../lib/dash/query-persist'
test('batches overlapping reads, caches missing values and invalidates', async () => {
 const client = new QueryClient(); const calls: string[][] = []; const scheduled: (() => void)[] = []
 const loader = createEntityLoader({ client, wallet: 'W', kind: 'widget', schedule: fn => scheduled.push(fn), fetchMany: async keys => { calls.push(keys); return new Map(keys.filter(k => k !== 'c').map(k => [k, { updatedAt: 1, expiresAt: 2, owner: 'O' }])) } })
 const a = loader.load(['a', 'b']), b = loader.load(['b', 'c']); scheduled.shift()!()
 expect([...(await a).keys()]).toEqual(['a', 'b']); expect((await b).get('c')).toBeNull(); expect(calls).toEqual([['a', 'b', 'c']])
 await loader.load(['a', 'c']); expect(calls.length).toBe(1)
 await loader.load(['a'], new Map([['a', '1:2:o']])); expect(calls.length).toBe(1)
 const changed = loader.load(['a'], new Map([['a', 'rev2']])); scheduled.shift()!(); await changed; expect(calls.length).toBe(2)
 await invalidateEntity(client, 'W', 'widget', 'a'); const again = loader.load(['a']); scheduled.shift()!(); await again; expect(calls.length).toBe(3)
 client.clear()
})
test('failed reads preserve earlier cache entries', async () => {
 const client = new QueryClient(); let fail = false
 const loader = createEntityLoader({client, wallet:'w', kind:'widget', fetchMany:async keys => { if(fail) throw new Error('offline'); return new Map(keys.map(k=>[k, {updatedAt:1,expiresAt:2,owner:"o"}])) }})
 await loader.load(['a']); fail = true; await expect(loader.load(['b'])).rejects.toThrow('offline'); expect(client.getQueryData(entityKeys.widget('w','a'))).toBeDefined(); client.clear()
})
test('revision, unavailable storage, persistence filter', async () => {
 expect(entityRev({updatedAt:5,expiresAt:9,owner:'0xAB'})).toBe('5:9:0xab')
 const persister = createIdbPersister(); expect(await persister.restoreClient()).toBeUndefined(); await persister.persistClient({timestamp:0,buster:'v1',clientState:{queries:[],mutations:[]}})
 const client = new QueryClient(); client.setQueryData(['arkiv','widget','w','a'], null); client.setQueryData(['other'], 1)
 const queries = client.getQueryCache().getAll(); expect(shouldPersistEntity(queries[0])).toBe(true); expect(shouldPersistEntity(queries[1])).toBe(false)
 queries[0].setState({status:'error'}); expect(shouldPersistEntity(queries[0])).toBe(false); client.clear()
})

test('restored entities retain revisions and wallet isolation', async () => {
 const { dehydrate, hydrate } = await import('@tanstack/react-query')
 const first = new QueryClient()
 const entity = {updatedAt:5,expiresAt:9,owner:'0xAB'}
 const loader = createEntityLoader({client:first,wallet:'W',kind:'widget',fetchMany:async()=>new Map([['a',entity]])})
 await loader.load(['A'])
 const second = new QueryClient(); hydrate(second,dehydrate(first,{shouldDehydrateQuery:shouldPersistEntity}))
 let calls = 0
 const restored = createEntityLoader({client:second,wallet:'w',kind:'widget',fetchMany:async()=>{calls++;return new Map()}})
 expect((await restored.load(['a'],new Map([['a',entityRev(entity)]]))).get('a')).toEqual(entity)
 expect(calls).toBe(0)
 const other = createEntityLoader({client:second,wallet:'other',kind:'widget',fetchMany:async()=>{calls++;return new Map()}})
 expect((await other.load(['a'])).get('a')).toBeNull(); expect(calls).toBe(1)
 first.clear(); second.clear()
})
test('quota and rate limits stop retries, transient failures allow two retries', async () => {
 const { RpcError } = await import('@asi/core')
 const { entityDefaults } = await import('../lib/dash/entity-cache')
 for(const error of [new RpcError('exhausted',429,0),new RpcError('quota exceeded',200,0),new RpcError('rate limit',200,0),new RpcError('budget',200,0)]) expect(entityDefaults.retry(0,error)).toBe(false)
 expect(entityDefaults.retry(0,new Error('offline'))).toBe(true)
 expect(entityDefaults.retry(1,new Error('offline'))).toBe(true)
 expect(entityDefaults.retry(2,new Error('offline'))).toBe(false)
})
test('stale replicas cannot undo an optimistic transfer or deletion', async () => {
 const { patchCachedWidget } = await import('../lib/dash/entity-cache')
 const client = new QueryClient(), key = entityKeys.widget('w','a')
 const entity = {updatedAt:1,expiresAt:9,owner:'old'}
 const loader = createEntityLoader({client,wallet:'w',kind:'widget',fetchMany:async()=>new Map([['a',entity]])})
 await loader.load(['a']); patchCachedWidget(client,'w','a',{owner:'new',expiresAt:20})
 client.setQueryData(key,(old: any)=>({...old,afterBlock:5}))
 await invalidateEntity(client,'w','widget','a')
 expect((await loader.load(['a'])).get('a')).toMatchObject({owner:'new',expiresAt:20})
 client.setQueryData(key,{value:null,afterBlock:5,deleted:true})
 await invalidateEntity(client,'w','widget','a')
 expect((await loader.load(['a'])).get('a')).toBeNull(); client.clear()
})

test('a malformed dashboard key is missing, not loading forever', () => {
 const good = '0x' + 'ab'.repeat(32)
 expect(bundleStatus({ enabled: true, key: 'notakey' })).toBe('missing')
 expect(bundleStatus({ enabled: true, key: '0x1234' })).toBe('missing')
 expect(bundleStatus({ enabled: false, key: 'notakey' })).toBe('loading')
 expect(bundleStatus({ enabled: true, key: good })).toBe('loading')
 expect(bundleStatus({ enabled: true, key: good, found: true })).toBe('ready')
 expect(bundleStatus({ enabled: true, key: good, found: false })).toBe('missing')
 expect(bundleStatus({ enabled: true, key: good, error: 'offline' })).toBe('error')
})
