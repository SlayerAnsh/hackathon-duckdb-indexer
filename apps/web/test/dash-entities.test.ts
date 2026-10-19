import { expect, test } from 'bun:test'
import { addr, key } from '@arkiv-network/sdk/attr'
import { and, eq, or, render } from '@arkiv-network/sdk/query'
import type { ArkivRpc, RpcEntity } from '@asi/core'
import { emptyWidget } from '../lib/dash/schema'
import { DASH_SELECT, asDashboard, asLink, asWidget, dashboardBundleExpr, decodeDashEntity, jsonPayload, keysExprs, queryAll, scopeExpr, widgetExtendExpr } from '../lib/dash/entities'
import { readPublicDashConfig } from '../lib/dash/config'

const W = `0x${'1a'.repeat(20)}` as const, U = `0x${'2b'.repeat(20)}` as const
const K = `0x${'ab'.repeat(32)}` as const, D = `0x${'22'.repeat(32)}` as const
const upper = (v: string) => v.toUpperCase().replace('0X', '0x') as `0x${string}`
const hex = (v: object) => ('0x' + Buffer.from(JSON.stringify(v)).toString('hex')) as `0x${string}`
const validWidget = { ...emptyWidget(), name: 'Top', sql: 'SELECT creator, count(*) AS n FROM entities GROUP BY 1', chart: 'hbar' as const }
const attr = (name: string, value: string, type = 'str') => ({ name, type, value })
const row = (over: Partial<RpcEntity> = {}): RpcEntity => ({ key: upper(K), owner: upper(W), creator: upper(W), createdAt: '0x10', updatedAt: '0x20', expiresAt: '0x30',
  attributes: [attr('type', 'widget'), attr('project', 'arkiv-sql-indexer-dash'), attr('user', upper(U), 'addr'), attr('login', 'google'), attr('name', 'Top'), attr('chart', 'hbar')], payload: hex(validWidget), ...over })

test('decodes a widget with lowercase hex and numeric blocks', () => {
  const w = asWidget(decodeDashEntity(row()), W)!
  expect(w).toMatchObject({ kind: 'widget', key: K, owner: W, creator: W, user: U, login: 'google', name: 'Top', chart: 'hbar', createdAt: 16, updatedAt: 32, expiresAt: 48 })
  expect(w.widget.sql).toBe(validWidget.sql)
  expect(decodeDashEntity(row({ expiresAt: '0xffffffffffffffff' })).expiresAt).toBe(Number.MAX_SAFE_INTEGER)
  expect(jsonPayload(validWidget)).toEqual(new TextEncoder().encode(JSON.stringify(validWidget)))
})

test('rejects foreign creators, wrong project, bad payloads and type mismatches', () => {
  expect(asWidget(decodeDashEntity(row({ creator: U })), W)).toBeNull()
  for (const payload of ['0x7b', '0xff', '0x1', '0xzz', undefined, hex({ v: 2 })] as const) {
    expect(asWidget(decodeDashEntity(row({ payload })), W)).toBeNull()
  }
  expect(decodeDashEntity(row({ payload: '0x7b' })).payload).toBeNull()
  expect(asDashboard(decodeDashEntity(row()), W)).toBeNull()
  for (const [name, value] of [['project', 'other'], ['user', 'bad'], ['login', 'email'], ['chart', 'scatter'], ['name', '']]) {
    expect(asWidget(decodeDashEntity(row({ attributes: row().attributes!.map(a => a.name === name ? { ...a, value } : a) })), W)).toBeNull()
  }
  for (const name of ['type', 'project', 'user', 'login', 'name', 'chart']) {
    expect(asWidget(decodeDashEntity(row({ attributes: row().attributes!.filter(a => a.name !== name) })), W)).toBeNull()
  }
  const mismatch = decodeDashEntity(row({ payload: hex({ ...validWidget, chart: 'table' }) }))
  expect(asWidget(mismatch, W)?.chart).toBe('table')
})

test('validates dashboards and links including typed key attributes', () => {
  const base = [attr('project', 'arkiv-sql-indexer-dash'), attr('user', upper(U), 'addr')]
  const dashboard = decodeDashEntity(row({ attributes: [...base, attr('type', 'dashboard'), attr('login', 'google'), attr('title', 'Overview')], payload: hex({ v: 1, title: 'Overview', description: '' }) }))
  expect(asDashboard(dashboard, upper(W))).toMatchObject({ kind: 'dashboard', user: U, login: 'google', title: 'Overview', dashboard: { v: 1, title: 'Overview', description: '' } })
  expect(asDashboard({ ...dashboard, attrs: { ...dashboard.attrs, title: '' } }, W)).toBeNull()
  const link = decodeDashEntity(row({ attributes: [...base, attr('type', 'link'), attr('dashboard', upper(D), 'key'), attr('widget', upper(K), 'key')], payload: hex({ v: 1, size: 'md', position: 0, name: 'Top' }) }))
  expect(asLink(link, W)).toMatchObject({ kind: 'link', user: U, dashboardKey: D, widgetKey: K, link: { v: 1, size: 'md', position: 0, name: 'Top' } })
  for (const field of ['dashboard', 'widget', 'user']) expect(asLink({ ...link, attrs: { ...link.attrs, [field]: 'bad' } }, W)).toBeNull()
  expect(asLink({ ...link, creator: U }, W)).toBeNull()
  expect(asLink({ ...link, payload: {} }, W)).toBeNull()
})

test('expressions scope every read to the dashboard wallet and project', () => {
  const scope = and(eq('$creator', addr(W)), eq('project', 'arkiv-sql-indexer-dash'))
  expect(scopeExpr(W)).toBe(render(scope))
  expect(scopeExpr(W).toLowerCase()).toContain(`$creator = addr(${W})`)
  expect(dashboardBundleExpr(W, D, [K])).toBe(render(and(scope, or(eq('$key', key(D)), eq('$key', key(K)), and(eq('type', 'link'), eq('dashboard', key(D)))))))
  expect(dashboardBundleExpr(W, D)).toBe(render(and(scope, or(eq('$key', key(D)), and(eq('type', 'link'), eq('dashboard', key(D)))))))
  expect(widgetExtendExpr(W, K, U)).toBe(render(and(scope, or(eq('$key', key(K)), and(eq('type', 'link'), eq('widget', key(K)), eq('user', addr(U)))))))
  const chunks = keysExprs(W, Array.from({ length: 51 }, (_, i) => '0x' + i.toString(16).padStart(64, '0')))
  expect(chunks).toHaveLength(2)
  for (const chunk of chunks) expect(chunk).toContain(scopeExpr(W))
  expect(keysExprs(W, [])).toEqual([])
})

test('queryAll follows cursors and reports the first page block', async () => {
  const pages = [{ data: [row()], blockNumber: 100, cursor: 'c1' }, { data: [row({ key: D })], blockNumber: 101 }]
  const calls: Parameters<ArkivRpc['query']>[] = []
  const rpc = { query: async (...args: Parameters<ArkivRpc['query']>) => { calls.push(args); return pages.shift()! } }
  const result = await queryAll(rpc, 'x')
  expect(result.head).toBe(100)
  expect(result.entities.map(e => e.key)).toEqual([K, D])
  expect(calls.map(c => c[1].cursor)).toEqual([undefined, 'c1'])
  expect(calls.every(c => c[0] === 'x' && c[1].limit === 200 && c[1].select === DASH_SELECT)).toBe(true)
  expect(DASH_SELECT).toEqual({ key: true, owner: true, creator: true, createdAt: true, updatedAt: true, expiresAt: true, attributes: true, payload: true })
  expect(await queryAll({ query: async () => ({ data: [], blockNumber: 102 }) }, 'x')).toEqual({ head: 102, entities: [] })
})

test('public config is enabled only with an app id and a valid wallet', () => {
  expect(readPublicDashConfig({ privyAppId: 'app', wallet: upper(W) })).toEqual({ enabled: true, privyAppId: 'app', wallet: W, rpcUrl: 'https://rpc.tiramisu.db-chain.testnet.arkiv.network' })
  for (const privyAppId of ['', '   ', undefined]) expect(readPublicDashConfig({ privyAppId, wallet: W }).enabled).toBe(false)
  expect(readPublicDashConfig({ privyAppId: 'app', wallet: 'nope' }).enabled).toBe(false)
  expect(readPublicDashConfig({}).enabled).toBe(false)
  expect(readPublicDashConfig({ rpcUrl: 'https://example.test' }).rpcUrl).toBe('https://example.test')
})
