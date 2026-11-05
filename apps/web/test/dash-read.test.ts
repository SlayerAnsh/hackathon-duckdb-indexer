import { expect, test } from 'bun:test'
import { rabdiEntity } from './dash-fakes'
import type { ArkivRpc, RpcEntity } from '@asi/core'
import { emptyWidget, DASH_PROJECT } from '../lib/dash/schema'
import { fetchWidget, fetchWidgets, fetchDashboardBundle, fetchDashboards } from '../lib/dash/read'
import { dashCte, userDashboardsSql, widgetUsageSql, syncedSql } from '../lib/dash/sql'
import { nativeDb } from './dash-duckdb'

const W = '0x' + 'ab'.repeat(20), U = '0x' + 'cd'.repeat(20)
const key = (n: number) => '0x' + n.toString(16).padStart(64, '0')
const K = key(1), D = key(2)
function row(k: string, type = 'widget', attrs: Record<string, string> = {}, payload: object = { ...emptyWidget(), name: 'Widget', sql: 'SELECT 1' }, creator = W): RpcEntity {
  return rabdiEntity({ key: k as `0x${string}`, owner: W as `0x${string}`, creator: creator as `0x${string}`, createdAt: '0x1', updatedAt: '0xa', expiresAt: '0xffff',
    attributes: Object.entries({ project: DASH_PROJECT, user: U, login: 'google', name: 'Widget', chart: 'table', type, ...attrs }).map(([name, value]) => ({ name, value, type: name === 'user' ? 'addr' : ['widget', 'dashboard'].includes(name) ? 'key' : 'str' })),
    payload: ('0x' + Buffer.from(JSON.stringify(payload)).toString('hex')) as `0x${string}` }) as RpcEntity
}
function fake(data: RpcEntity[]) {
  const calls: Parameters<ArkivRpc['query']>[] = []
  return { calls, query: async (...args: Parameters<ArkivRpc['query']>) => { calls.push(args); return { data, blockNumber: 42 } } }
}
test('fetchWidgets chunks 51 keys and rejects foreign and unrequested rows', async () => {
  const keys = Array.from({ length: 51 }, (_, i) => key(i + 1))
  const rpc = fake([row(K), row(D, 'widget', {}, undefined, U), row(key(100))])
  const result = await fetchWidgets(rpc, W, keys)
  expect(rpc.calls).toHaveLength(2)
  expect(result.head).toBe(42)
  expect([...result.widgets.keys()]).toEqual([K])
  expect(await fetchWidgets(fake([]), W, [])).toEqual({ head: 0, widgets: new Map() })
})
test('dashboard bundle filters and orders links by position then key', async () => {
  const link = (k: number, position: number, dashboard = D) => row(key(k), 'link', { dashboard, widget: K }, { v: 1, size: 'md', position, name: 'Widget' })
  const rpc = fake([link(5, 1), link(4, 1), link(6, 0), link(7, 0, K), row(D, 'dashboard', { title: 'Overview' }, { v: 1, title: 'Overview', description: '' })])
  const result = await fetchDashboardBundle(rpc, W, D)
  expect(result.head).toBe(42)
  expect(result.dashboard?.key).toBe(D)
  expect(result.links.map(l => l.key)).toEqual([key(6), key(4), key(5)])
  expect((await fetchDashboardBundle(fake([]), W, D)).dashboard).toBeNull()
})
test('fetchWidget validates payloads and requested key', async () => {
  expect((await fetchWidget(fake([row(K, 'widget', {}, { v: 2 })]), W, K)).widget).toBeNull()
  expect((await fetchWidget(fake([row(D)]), W, K)).widget).toBeNull()
  expect((await fetchWidget(fake([row(K)]), W, K)).widget?.key).toBe(K)
})
test('SQL validates every address and key and scopes the CTE', () => {
  for (const bad of ['0x12', "x' OR 1=1"]) {
    for (const build of [() => dashCte(bad), () => userDashboardsSql(bad, U, K), () => userDashboardsSql(W, bad, K), () => userDashboardsSql(W, U, bad), () => widgetUsageSql(bad, K, U), () => widgetUsageSql(W, bad, U), () => widgetUsageSql(W, K, bad), () => syncedSql(bad, 7, 'upsert')]) expect(build).toThrow()
  }
  expect(dashCte(W.toUpperCase().replace('0X', '0x'))).toContain(`e.creator = '${W}'`)
  expect(dashCte(W)).toContain("'arkiv-sql-indexer-dash'")
  expect(syncedSql(K, 7, 'upsert')).toContain('updated_at > 7')
  expect(syncedSql(K, 7, 'upsert')).toContain('NOT attrs_pending')
  expect(syncedSql(K, 7, 'delete')).toContain('count(*) = 0')
})
test('queries execute over native DuckDB public tables', async () => {
  const base = { project: DASH_PROJECT, user: U }
  const { db, close } = await nativeDb([
    { key: D, creator: W, attrs: { ...base, type: 'dashboard', title: 'Overview' } },
    { key: K, creator: W, attrs: { ...base, type: 'widget', name: 'Widget' } },
    { key: key(3), creator: W, attrs: { ...base, type: 'link', dashboard: D, widget: K } },
    { key: key(4), creator: U, attrs: { ...base, type: 'widget' } },
    { key: key(5), creator: U, attrs: { ...base, type: 'link', dashboard: D, widget: K } },
  ])
  const query = async (sql: string) => (await db.runAndReadAll(sql)).getRowObjects()
  try {
    expect(await query(userDashboardsSql(W, U, K))).toEqual([{ key: D, title: 'Overview', widgets: BigInt(1), has_widget: true, updated_at: BigInt(10) }])
    expect(await query(widgetUsageSql(W, K, U))).toEqual([{ dashboards: BigInt(1), mine: true }])
    expect(await query(widgetUsageSql(W, K, null))).toEqual([{ dashboards: BigInt(1), mine: false }])
    expect(await query(userDashboardsSql(W, U, null))).toMatchObject([{ has_widget: false }])
    expect(await query(syncedSql(K, 7, 'upsert'))).toEqual([{ n: 1 }])
    expect(await query(syncedSql(K, 10, 'upsert'))).toEqual([{ n: 0 }])
    await db.run(`UPDATE entities SET attrs_pending = true WHERE key = '${K}'`)
    expect(await query(syncedSql(K, 7, 'upsert'))).toEqual([{ n: 0 }])
    expect(await query(syncedSql(K, 7, 'delete'))).toEqual([{ n: 0 }])
    expect(await query(syncedSql(key(99), 7, 'delete'))).toEqual([{ n: 1 }])
    expect(await query(widgetUsageSql(W, key(99), U))).toEqual([{ dashboards: BigInt(0), mine: false }])
  } finally { close() }
})

test('fetchDashboards chunks keys, validates scope and payloads, and ignores unrequested rows', async () => {
 const keys = Array.from({length:51}, (_,i)=>key(i+1))
 const dashboard = (k: string, creator = W, payload: object = {v:1,title:'Overview',description:'Report'}) => row(k,'dashboard',{title:'Overview'},payload,creator)
 const rpc = fake([dashboard(K),dashboard(D,U),dashboard(key(3),W,{v:2}),dashboard(key(99))])
 const result = await fetchDashboards(rpc,W,keys)
 expect(rpc.calls).toHaveLength(2)
 expect(result.head).toBe(42)
 expect([...result.dashboards.keys()]).toEqual([K])
 expect(result.dashboards.get(K)?.dashboard.description).toBe('Report')
 expect(await fetchDashboards(fake([]),W,[])).toEqual({head:0,dashboards:new Map()})
})
