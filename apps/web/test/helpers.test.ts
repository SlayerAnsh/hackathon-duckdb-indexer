import { test, expect } from 'bun:test'
import { DuckDBInstance } from '../../../packages/core/node_modules/@duckdb/node-api'
import { RAW_TABLES_SQL, MERGE_VIEWS_SQL, setHeadSql } from '@asi/core'
import { classifyVerify } from '../lib/verify'
import { toCsv } from '../lib/csv'
import { readHash, writeHash } from '../lib/hash-state'
import { sqlCompletions } from '../lib/sql-complete'
import { TILES } from '../lib/tiles'

test('verification branches', () => {
 const row = { updated_at: 10, expires_at: 100 }
 expect(classifyVerify(row, null, 20)).toBe('deleted')
 expect(classifyVerify(row, { updatedAt: 11, expiresAt: 20 }, 20)).toBe('expired')
 expect(classifyVerify(row, { updatedAt: 11, expiresAt: 110 }, 20)).toBe('extended')
 expect(classifyVerify(row, { updatedAt: 11, expiresAt: 100 }, 20)).toBe('stale')
 expect(classifyVerify(row, { updatedAt: 10, expiresAt: 100 }, 20)).toBe('ok')
 expect(classifyVerify(row, { updatedAt: 10, expiresAt: 110 }, 20)).toBe('stale')
})
test('CSV RFC4180 and bigint', () => expect(toCsv(['a','b'], [['x,y','a"b'], ['a\nb',BigInt('9007199254740993')]])).toBe('a,b\r\n"x,y","a""b"\r\n"a\nb",9007199254740993'))
test('UTF8 hash roundtrip and invalid hash', () => {
 const previous = globalThis.window
 Object.assign(globalThis, { window: { location: { hash: '' }, history: { replaceState(_a: unknown,_b: unknown, hash: string) { window.location.hash = hash } } } })
 try { writeHash("SELECT 'हेलो 🌍'"); expect(readHash()).toBe("SELECT 'हेलो 🌍'"); window.location.hash = '#%%%'; expect(readHash()).toBeNull() } finally { Object.assign(globalThis, { window: previous }) }
})
test('schema completion interface', () => expect(sqlCompletions({ entities: ['key'] })).toEqual({ schema: { entities: ['key'] } }))
test('all tile SQL executes with seeded merge views', async () => {
 const instance = await DuckDBInstance.create(':memory:'); const db = await instance.connect()
 try {
 for (const sql of [...RAW_TABLES_SQL,...MERGE_VIEWS_SQL,...setHeadSql(5000)]) await db.run(sql)
 await db.run("INSERT INTO base_entities VALUES ('a','o','c',100,100,6000,NULL,0),('b','o','c',4000,4000,9000,NULL,0),('c','o','d',4900,4900,10000,NULL,0)")
 await db.run("INSERT INTO base_attributes VALUES ('a','type','str','demo',NULL),('b','type','str','demo',NULL)")
 expect(TILES.map(t => t.id)).toEqual(['live','expiring_hour','by_type','created_per_hour','expiry_horizon','top_creators'])
 for (const tile of TILES) await db.run(tile.sql)
 } finally { db.closeSync(); instance.closeSync() }
})

test('verifyRows batches 51 keys, selects fields, preserves missing rows and throws budget error', async () => {
 const { verifyRows } = await import('../lib/verify')
 const { RpcError } = await import('@asi/core')
 const original = globalThis.fetch; const calls: { params: [string, {select: unknown}] }[] = []
 const keys = Array.from({length:51},(_,i) => '0x' + i.toString(16).padStart(64,'0'))
 try {
 globalThis.fetch = (async (_url: unknown, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); return Response.json({ result: { data: [{ key: keys[0], updatedAt: '0xa', expiresAt: '0x64', owner: '0xabc' }], blockNumber: '0x14' } }) }) as typeof fetch
 const rows = await verifyRows('https://fake.invalid',keys)
 expect(calls.length).toBe(2)
 expect(calls[0].params[1].select).toEqual({ key:true, updatedAt:true, expiresAt:true, owner:true })
 expect(rows.get(keys[0])?.updatedAt).toBe(10)
 expect(rows.get(keys[50])).toBeNull()
 globalThis.fetch = (async () => Response.json({ error:'ANON_COST_LIMITED' },{status:429})) as unknown as typeof fetch
 await expect(verifyRows('https://fake.invalid',[keys[0]])).rejects.toBeInstanceOf(RpcError)
 } finally { globalThis.fetch = original }
})
