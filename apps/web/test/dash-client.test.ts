import { expect, test } from 'bun:test'
import { createDashApi, DashApiError, type DashApi } from '../lib/dash/api'
import { runSessionHandshake, withSession, saveErrorMessage } from '../lib/dash/auth-client'
import { addPending, listPending, clearPending } from '../lib/dash/pending'
import { timeLeftLabel, extendPreview } from '../lib/dash/time'
import { emptyWidget } from '../lib/dash/schema'

const session = { address: '0xabc', login: 'google' as const }

test('api sends JSON with same origin credentials and maps errors', async () => {
  const seen: { url: unknown; init?: RequestInit }[] = []
  const fake = (async (url, init) => {
    seen.push({ url, init })
    return new Response(JSON.stringify({ error: 'rate_limited', message: 'slow' }), { status: 429, headers: { 'retry-after': '30' } })
  }) as typeof fetch
  await expect(createDashApi(fake, '').createWidget({ widget: emptyWidget() })).rejects.toMatchObject({ code: 'rate_limited', status: 429, retryAfterSec: 30 })
  expect(seen[0].url).toBe('/api/dash/widgets')
  expect(seen[0].init?.method).toBe('POST')
  expect(new Headers(seen[0].init?.headers).get('content-type')).toBe('application/json')
  expect(seen[0].init?.credentials).toBe('same-origin')
})

test('session returns null only on 401', async () => {
  const api = (status: number) => createDashApi((async () => Response.json(status === 200 ? session : { error: 'forbidden', message: 'no' }, { status })) as unknown as typeof fetch)
  expect(await api(401).session()).toBeNull()
  expect(await api(200).session()).toEqual(session)
  await expect(api(403).session()).rejects.toMatchObject({ status: 403 })
})

test('all API methods follow the contract', async () => {
  const seen: { url: unknown; init?: RequestInit }[] = []
  const api = createDashApi((async (url, init) => { seen.push({ url, init }); return Response.json({ txHash: 'tx', afterBlock: 2 }) }) as typeof fetch, '/base')
  const widget = emptyWidget(), dashboard = { title: 'Title', description: 'Body' }, link = { widget: 'w', size: 'md' as const }, organize = { items: [{ link: null, ...link }] }
  await api.nonce(); await api.createSession('token', 'n', 'sig'); await api.logout()
  await api.createWidget({ widget, addTo: { dashboard: 'd', size: 'md' } }); await api.createWidget({ widget, replaces: 'w' })
  await api.createDashboard(dashboard); await api.updateDashboard('d', dashboard); await api.deleteDashboard('d'); await api.organize('d', organize); await api.addLink('d', link)
  expect(seen.map(({ url, init }) => [url, init?.method])).toEqual([
    ['/base/api/dash/auth/nonce', 'POST'], ['/base/api/dash/auth/session', 'POST'], ['/base/api/dash/auth/session', 'DELETE'],
    ['/base/api/dash/widgets', 'POST'], ['/base/api/dash/widgets', 'POST'],
    ['/base/api/dash/dashboards', 'POST'], ['/base/api/dash/dashboards/d', 'PUT'], ['/base/api/dash/dashboards/d', 'DELETE'], ['/base/api/dash/dashboards/d/organize', 'POST'], ['/base/api/dash/dashboards/d/links', 'POST'],
  ])
  expect(new Headers(seen[1].init?.headers).get('authorization')).toBe('Bearer token')
  expect(seen.map(s => JSON.parse(s.init!.body as string))).toEqual([{}, { nonce: 'n', signature: 'sig' }, {}, { widget, addTo: { dashboard: 'd', size: 'md' } }, { widget, replaces: 'w' }, dashboard, dashboard, {}, organize, link])
  for (const name of ['updateWidget', 'deleteWidget', 'extendWidget']) expect(name in api).toBe(false)
  for (const { init } of seen) {
    expect(init?.credentials).toBe('same-origin')
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
  }
})

test('handshake signs the server message and posts the token', async () => {
  const calls: unknown[] = []
  const api = { nonce: async () => { calls.push('nonce'); return { nonce: 'n1', message: 'm1' } }, createSession: async (...args: string[]) => { calls.push(args); return session } } as unknown as DashApi
  const deps = { api, getAccessToken: async () => 'tok', signMessage: async (message: string) => { calls.push(message); return '0xsig' } }
  expect(await runSessionHandshake(deps)).toEqual(session)
  expect(calls).toEqual(['nonce', 'm1', ['tok', 'n1', '0xsig']])
  await expect(runSessionHandshake({ ...deps, getAccessToken: async () => null })).rejects.toBeInstanceOf(Error)
})

test('withSession logs in once on 401 and retries once', async () => {
  const error = new DashApiError('unauthenticated', 401, 'Login required')
  let calls = 0, logins = 0
  expect(await withSession(async () => { if (++calls === 1) throw error; return 'ok' }, async () => { logins++; return true })).toBe('ok')
  expect([calls, logins]).toEqual([2, 1])
  calls = 0; logins = 0
  await expect(withSession(async () => { calls++; throw error }, async () => { logins++; return false })).rejects.toBe(error)
  expect([calls, logins]).toEqual([1, 1])
  calls = 0; logins = 0
  await expect(withSession(async () => { calls++; throw error }, async () => { logins++; return true })).rejects.toBe(error)
  expect([calls, logins]).toEqual([2, 1])
  const forbidden = new DashApiError('forbidden', 403, 'Forbidden')
  await expect(withSession(async () => { throw forbidden }, async () => { logins++; return true })).rejects.toBe(forbidden)
  expect(logins).toBe(1)
})

test('save errors use the exact UI copy', () => {
  expect(saveErrorMessage(new DashApiError('rate_limited', 429, 'slow'))).toBe('Too many saves. Try again in a minute.')
  expect(saveErrorMessage(new Error('failure'))).toBe("Couldn't save to Arkiv. Your draft is kept. Try again.")
})

test('time labels follow the UI chips', () => {
  expect(timeLeftLabel(43200 * 6 + 1800 * 23, 0)).toEqual({ text: '6d 23h left', tone: 'live' })
  expect(timeLeftLabel(1800 * 3, 0)).toEqual({ text: 'Expires in 3h', tone: 'warn' })
  expect(timeLeftLabel(30 * 40, 0)).toEqual({ text: 'Expires in 40m', tone: 'warn' })
  expect(timeLeftLabel(100, 100)).toEqual({ text: 'Expired', tone: 'expired' })
  expect(timeLeftLabel(99, 100).tone).toBe('expired')
  expect(timeLeftLabel(43200, 0)).toEqual({ text: '1d 0h left', tone: 'live' })
})

test('extend preview clips at 90 days remaining', () => {
  expect(extendPreview(43200, 0, 7)).toEqual({ daysAdded: 7, atCap: false })
  expect(extendPreview(43200 * 87, 0, 7)).toEqual({ daysAdded: 3, atCap: false })
  expect(extendPreview(43200 * 90, 0, 7)).toEqual({ daysAdded: 0, atCap: true })
  expect(extendPreview(43200 * 91, 0, 7).atCap).toBe(true)
})

test('pending writes expire after five minutes and replace by key', () => {
  const write = { key: 'k', kind: 'widget' as const, op: 'upsert' as const, afterBlock: 5 }
  addPending(write, 0)
  expect(listPending(299_999).map(w => w.key)).toEqual(['k'])
  expect(listPending(300_001)).toEqual([])
  addPending(write, 1)
  addPending({ ...write, op: 'delete', afterBlock: 6 }, 2)
  expect(listPending(3)).toEqual([{ ...write, op: 'delete', afterBlock: 6, at: 2 }])
  clearPending('k')
  expect(listPending(3)).toEqual([])
})
