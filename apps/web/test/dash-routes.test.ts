import { existsSync, readFileSync } from 'node:fs'
import * as ops from '../lib/dash/server/operations'
import { privateKeyToAccount } from 'viem/accounts'
import { readServerDashConfig } from '../lib/dash/server/config'
import { expect, test } from 'bun:test'
import { deriveSessionSecret, signSession } from '../lib/dash/server/session'
import { NonceStore } from '../lib/dash/server/nonce'
import { GLOBAL_WRITE_RULES, NONCE_RULES, RateLimiter, WRITE_RULES } from '../lib/dash/server/rate-limit'
import type { DashDeps } from '../lib/dash/server/deps'
import * as routes from '../lib/dash/server/routes'
import { D, K, OTHER, PREDICTED_1, U, dashboardRow, fakeChain, validWidget, widgetRow } from './dash-fakes'

const now = () => 1_000_000
const secret = deriveSessionSecret('offline route test fixture')
function fixture(rows = [widgetRow(), dashboardRow()]) {
  const chain = fakeChain(rows)
  const deps: DashDeps = { ops: chain.deps, config: { sessionSecret: secret }, now,
    privy: { verify: async () => { throw new Error('unused') } }, nonces: new NonceStore({ now }),
    nonceLimiter: new RateLimiter(NONCE_RULES, now), writeLimiter: new RateLimiter(WRITE_RULES, now), globalLimiter: new RateLimiter(GLOBAL_WRITE_RULES, now) }
  return { ...chain, deps }
}
function request(body: unknown = {}, options: { address?: string; cookie?: boolean; type?: string; origin?: string; raw?: string } = {}) {
  const headers = new Headers({ 'content-type': options.type ?? 'application/json' })
  if (options.cookie !== false) headers.set('cookie', `dash_session=${signSession({ address: options.address ?? U, login: 'google', exp: 2000 }, secret)}`)
  if (options.origin) headers.set('origin', options.origin)
  return new Request('https://web/api/dash', { method: 'POST', headers, body: options.raw ?? JSON.stringify(body) })
}
const handlers = [
  routes.handleCreateWidget, routes.handleCreateDashboard,
  ...[routes.handleUpdateDashboard,
    routes.handleDeleteDashboard, routes.handleOrganize, routes.handleAddLink].map(fn => (req: Request, deps: DashDeps) => fn(req, deps, K)),
]

test('every write handler checks request shape, session, rate limits, then validates', async () => {
  for (const handler of handlers) {
    const { deps, calls, queries } = fixture()
    expect((await handler(request({}, { cookie: false }), deps)).status).toBe(401)
    expect((await handler(request({}, { type: 'text/plain' }), deps)).status).toBe(400)
    expect((await handler(request({}, { origin: 'https://foreign' }), deps)).status).toBe(403)
    const order: string[] = []
    deps.writeLimiter.take = id => { order.push(id); return { ok: true } }
    deps.globalLimiter.take = id => { order.push(id); return { ok: false, retryAfterSec: 15 } }
    const limited = await handler(request({}, { raw: 'invalid json' }), deps)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('15')
    expect(order).toEqual([U, 'all'])
    expect(calls).toEqual([])
    expect(queries).toEqual([])
  }
  const { deps, calls } = fixture()
  const invalid = await routes.handleCreateWidget(request({ widget: {} }), deps)
  expect(invalid.status).toBe(400)
  expect(await invalid.json()).toMatchObject({ error: 'invalid' })
  for (const fn of [routes.handleUpdateDashboard,
    routes.handleDeleteDashboard, routes.handleOrganize, routes.handleAddLink]) {
    const f = fixture()
    expect((await fn(request({ widget: validWidget, title: 'Overview', items: [] }), f.deps, '0x12')).status).toBe(400)
    expect(f.calls).toEqual([])
  }
  expect(calls).toEqual([])
})

test('per address and global limits reject before parsing without spending the next limiter', async () => {
  const { deps } = fixture()
  for (let i = 0; i < 5; i++) expect((await routes.handleCreateWidget(request({ widget: validWidget }), deps)).status).toBe(200)
  let globalCalls = 0
  const take = deps.globalLimiter.take.bind(deps.globalLimiter)
  deps.globalLimiter.take = id => { globalCalls++; return take(id) }
  const sixth = await routes.handleCreateWidget(request({}, { raw: 'invalid' }), deps)
  expect(sixth.status).toBe(429)
  expect(sixth.headers.get('retry-after')).toBe('60')
  expect(globalCalls).toBe(0)
  expect((await routes.handleCreateWidget(request({ widget: validWidget }, { address: OTHER }), deps)).status).toBe(200)
  for (let i = 6; i < 80; i++) expect(deps.globalLimiter.take('all').ok).toBe(true)
  const global = await routes.handleCreateWidget(request({}, { address: OTHER, raw: 'invalid' }), deps)
  expect(global.status).toBe(429)
  expect(global.headers.get('retry-after')).toBe('3600')
})

test('create widget returns the write result as JSON', async () => {
  const { deps, calls } = fixture()
  const response = await routes.handleCreateWidget(request({ widget: validWidget }), deps)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/json')
  expect(await response.json()).toEqual({ txHash: '0xtx', afterBlock: 1000, key: PREDICTED_1, expiresAt: 1000 + 7 * 43200 })
  expect(calls.map(c => c.method)).toEqual(['batch'])
})

test('domain errors map to status codes', async () => {
  const forbidden = fixture([widgetRow({ owner: OTHER })])
  const missing = fixture([])
  const busy = fixture()
  busy.deps.ops.queue.run = async () => { const { dashErrors } = await import('../lib/dash/server/errors'); throw dashErrors.busy() }
  const unknown = fixture()
  unknown.deps.ops.client.executeBatch = async () => { throw new Error('synthetic SDK failure') }
  for (const [response, status, error] of [
    [await routes.handleCreateWidget(request({ widget: validWidget, replaces: K }), forbidden.deps), 403, 'forbidden'],
    [await routes.handleCreateWidget(request({ widget: validWidget, replaces: K }), missing.deps), 404, 'not_found'],
    [await routes.handleCreateWidget(request({ widget: validWidget }), busy.deps), 503, 'busy'],
    [await routes.handleCreateWidget(request({ widget: validWidget }), unknown.deps), 502, 'chain'],
  ] as const) {
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ error, ...(error === 'chain' ? { message: 'Arkiv write failed. Try again.' } : {}) })
  }
})

test('invalid bodies and references never reach the chain', async () => {
  for (const [fn, body] of [
    [routes.handleCreateWidget, { widget: validWidget, addTo: { dashboard: '0x12', size: 'md' } }],
    [routes.handleCreateWidget, { widget: validWidget, addTo: { dashboard: D, size: 'bad' } }],
    [routes.handleCreateWidget, { widget: validWidget, replaces: 'nope' }],
    [routes.handleCreateWidget, { widget: validWidget, replaces: K, addTo: { dashboard: D, size: 'md' } }],
    [routes.handleCreateDashboard, { title: '' }],
    [(r: Request, d: DashDeps) => routes.handleUpdateDashboard(r, d, D), { title: 42 }],
    [(r: Request, d: DashDeps) => routes.handleOrganize(r, d, D), { items: [{ link: null, widget: '0x12', size: 'md' }] }],
    [(r: Request, d: DashDeps) => routes.handleAddLink(r, d, D), { widget: K, size: 'bad' }],
    [(r: Request, d: DashDeps) => routes.handleAddLink(r, d, D), { widget: '0x12', size: 'md' }],
  ] as const) {
    const { deps, calls, queries } = fixture()
    const response = await fn(request(body), deps)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'invalid' })
    expect(calls).toEqual([])
    expect(queries).toEqual([])
  }
  for (const raw of ['{', JSON.stringify({ padding: 'a'.repeat(32768) }), 'null', '[]']) {
    const { deps, calls } = fixture()
    expect((await routes.handleCreateWidget(request({}, { raw }), deps)).status).toBe(400)
    expect(calls).toEqual([])
  }
})

test('valid handlers invoke the existing operations', async () => {
  for (const [fn, body, key, method] of [
    [routes.handleUpdateDashboard, { title: 'Renamed' }, D, 'patch'],
    [routes.handleDeleteDashboard, {}, D, 'batch'],
    [routes.handleOrganize, { title: 'Renamed', items: [] }, D, 'batch'],
    [routes.handleAddLink, { widget: K, size: 'sm' }, D, 'create'],
  ] as const) {
    const { deps, calls } = fixture()
    expect((await fn(request(body), deps, key)).status).toBe(200)
    expect(calls.map(c => c.method)).toEqual([method])
  }
  const { deps, calls } = fixture()
  expect((await routes.handleCreateDashboard(request({ title: 'New' }), deps)).status).toBe(200)
  expect(calls[0].data.values.title).toBe('New')
  const added = fixture()
  expect((await routes.handleCreateWidget(request({ widget: validWidget, addTo: { dashboard: D, size: 'sm' } }), added.deps)).status).toBe(200)
  expect(added.calls.map(c => c.method)).toEqual(['batch'])
})

test('disabled deps answer 503 disabled', async () => {
  let invoked = false
  const response = await routes.withDeps({ disabled: 'NEXT_PUBLIC_PRIVY_APP_ID is not set' }, async () => { invoked = true; return new Response('x') })
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'disabled', message: 'Dashboards are not enabled on this deployment.' })
  expect(invoked).toBe(false)
})

test('route files are thin and force dynamic without constructing production deps on import', async () => {
  for (const [path, methods] of [
    ['config', ['GET']], ['auth/nonce', ['POST']], ['auth/session', ['GET', 'POST', 'DELETE']], ['widgets', ['POST']],
    ['dashboards', ['POST']], ['dashboards/[key]', ['PUT', 'DELETE']], ['dashboards/[key]/organize', ['POST']], ['dashboards/[key]/links', ['POST']],
  ] as const) {
    const module = await import(`../app/api/dash/${path}/route.ts`)
    expect(module.dynamic).toBe('force-dynamic')
    for (const method of methods) expect(typeof module[method]).toBe('function')
  }
})

 test('public dashboard config returns only the derived wallet without caching', async () => {
  const privateKey = ('0x' + '42'.repeat(32)) as `0x${string}`
  const result = readServerDashConfig({ NEXT_PUBLIC_PRIVY_APP_ID: 'app', PRIVY_APP_SECRET: 'offline fixture', DASHBOARD_PRIVATE_KEY: privateKey })
  expect(result.ok).toBe(true)
  if (!result.ok) return
  for (const config of [result.config, null]) {
   const response = routes.handleDashConfig({ config })
   expect(response.status).toBe(200)
   expect(response.headers.get('cache-control')).toBe('no-store')
   expect(await response.json()).toEqual({ wallet: config ? privateKeyToAccount(privateKey).address.toLowerCase() : null })
  }
 })

test('server widget mutation endpoints and exports are removed', () => {
 for (const path of ['widgets/[key]/route.ts', 'widgets/[key]/extend/route.ts']) expect(existsSync(new URL('../app/api/dash/' + path, import.meta.url))).toBe(false)
 const source = readFileSync(new URL('../lib/dash/server/routes.ts', import.meta.url), 'utf8')
 for (const name of ['UpdateWidget', 'DeleteWidget', 'ExtendWidget']) expect(source).not.toContain('handle' + name)
 for (const name of ['updateWidget', 'deleteWidget', 'extendWidget']) expect(name in ops).toBe(false)
})
