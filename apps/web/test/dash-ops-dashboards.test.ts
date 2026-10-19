import { expect, test } from 'bun:test'
import { ExpirationTime } from '@arkiv-network/sdk'
import { addr, key } from '@arkiv-network/sdk/attr'
import { asDashboard, asLink, asWidget, decodeDashEntity, dashboardBundleExpr } from '../lib/dash/entities'
import { parseOrganizeInput, planOrganize, createDashboard, updateDashboard, deleteDashboard, organizeDashboard, addLink } from '../lib/dash/server/operations'
import { fakeChain, dashboardRow, linkRow, widgetRow, validWidget, U, OTHER, W, D, K, PREDICTED_1 } from './dash-fakes'
const S = { address: U, login: 'google' as const, exp: 9e9 }
const L1 = `0x${'31'.repeat(32)}`, L2 = `0x${'32'.repeat(32)}`, L3 = `0x${'33'.repeat(32)}`, W2 = `0x${'42'.repeat(32)}` as const
const target = 1000 + 90 * 43200
const payload = (data: any) => JSON.parse(new TextDecoder().decode(data.payload))
const dash = (expiresAt = 5000) => asDashboard(decodeDashEntity(dashboardRow({ expiresAt })), W)!
const link = (k: string, w: string, position: number, expiresAt = 5000) => asLink(decodeDashEntity(linkRow({ key: k, widget: w, position, expiresAt })), W)!
const widget = () => asWidget(decodeDashEntity(widgetRow({ key: W2 })), W)!
const state = () => ({ head: 1000, dashboard: dash(), links: [link(L1, K, 0), link(L2, W2, 1), link(L3, D, 2)], widgets: new Map([[W2, widget()]]) })

test('planOrganize renumbers, preserves stored names and patches only changed links', () => {
  const p = planOrganize(state(), { items: [{ link: L1, widget: K, size: 'md' }, { link: null, widget: W2, size: 'xs' }] })
  expect(p).toEqual({ target, creates: [{ widget: W2, size: 'xs', position: 1, name: validWidget.name }], patches: [], deletes: [L2, L3], extend: [D, L1] })
  const moved = planOrganize(state(), { items: [{ link: L2, widget: W2, size: 'md' }, { link: L1, widget: K, size: 'xl' }] })
  expect(moved.patches).toEqual([{ link: L2, size: 'md', position: 0, name: validWidget.name }, { link: L1, size: 'xl', position: 1, name: validWidget.name }])
  expect(moved.extend).toEqual([D, L2, L1])
})
test('organize input validates keys, sizes, count and dashboard title rules', () => {
  expect(parseOrganizeInput({ title: ' Hi ', items: [] })).toEqual({ ok: true, value: { title: 'Hi', items: [] } })
  for (const input of [null, {}, { items: null }, { items: [{ link: null, widget: 'bad', size: 'md' }] }, { items: [{ link: 'bad', widget: K, size: 'md' }] }, { items: [{ link: null, widget: K, size: 'bad' }] }, { items: [], title: '' }, { items: [], title: 'x'.repeat(81) }, { items: Array(49).fill({ link: null, widget: K, size: 'md' }) }]) expect(parseOrganizeInput(input).ok).toBe(false)
})
test('plan rejects foreign links, changed references, duplicates, missing and expired imports and overflow', () => {
  for (const [items, code] of [
    [[{ link: D, widget: K, size: 'md' }], 'invalid'],
    [[{ link: L1, widget: W2, size: 'md' }], 'invalid'],
    [[{ link: L1, widget: K, size: 'md' }, { link: null, widget: K, size: 'md' }], 'conflict'],
    [[{ link: null, widget: D, size: 'md' }], 'not_found'],
    [Array(49).fill({ link: null, widget: K, size: 'md' }), 'full'],
  ] as const) expect(() => planOrganize(state(), { items: items as any })).toThrow(expect.objectContaining({ code }))
  const st = state(); st.widgets.get(W2)!.expiresAt = 1000
  expect(() => planOrganize(st, { items: [{ link: null, widget: W2, size: 'md' }] })).toThrow(expect.objectContaining({ code: 'not_found' }))
})
test('plan skips extensions at or past target', () => {
  const st = { ...state(), dashboard: dash(target), links: [link(L1, K, 0, target + 1)] }
  expect(planOrganize(st, { items: [{ link: L1, widget: K, size: 'md' }] }).extend).toEqual([])
})
test('organize reads one bundle and sends exactly one batch matching its plan', async () => {
  const f = fakeChain([dashboardRow(), linkRow({ key: L1 }), linkRow({ key: L3, widget: D }), widgetRow({ key: W2 })])
  expect(await organizeDashboard(f.deps, S, D, { title: 'Renamed', items: [{ link: L1, widget: K, size: 'xl' }, { link: null, widget: W2, size: 'xs' }] })).toEqual({ txHash: '0xtx', afterBlock: 1000, expiresAt: target })
  expect(f.queries).toEqual([dashboardBundleExpr(W, D, [W2])])
  expect(f.calls.map(c => c.method)).toEqual(['batch'])
  const b = f.calls[0].data
  expect(b.creates[0].attributes).toEqual({ type: 'link', project: 'arkiv-sql-indexer-dash', user: addr(U), dashboard: key(D), widget: key(W2) })
  expect(payload(b.creates[0])).toEqual({ v: 1, size: 'xs', position: 1, name: validWidget.name })
  expect(b.creates[0].expires).toEqual(ExpirationTime.atBlock(BigInt(target)))
  expect(b.patches.map((p: any) => [p.entityKey, payload(p)])).toEqual([[L1, { v: 1, size: 'xl', position: 0, name: validWidget.name }], [D, { v: 1, title: 'Renamed', description: '' }]])
  expect(b.patches[1].set).toEqual({ title: 'Renamed' })
  expect(b.deletes).toEqual([{ entityKey: L3 }])
  expect(b.extensions).toEqual([D, L1].map(entityKey => ({ entityKey, expires: ExpirationTime.atBlock(BigInt(target)) })))
})
test('unchanged organize at target does not send an empty batch', async () => {
  const f = fakeChain([dashboardRow({ expiresAt: target }), linkRow({ key: L1, expiresAt: target })])
  expect(await organizeDashboard(f.deps, S, D, { items: [{ link: L1, widget: K, size: 'md' }] })).toEqual({ txHash: '', afterBlock: 1000 })
  expect(f.calls).toEqual([])
})
test('create, rename and delete dashboards', async () => {
  const f = fakeChain([])
  expect(await createDashboard(f.deps, S, { title: 'New' })).toEqual({ txHash: '0xtx', afterBlock: 1000, key: PREDICTED_1, expiresAt: 0 })
  expect(f.calls[0].data.attributes).toEqual({ type: 'dashboard', project: 'arkiv-sql-indexer-dash', user: addr(U), login: 'google', title: 'New' })
  expect(payload(f.calls[0].data)).toEqual({ v: 1, title: 'New', description: '' })
  expect(f.calls[0].data.expires).toEqual(ExpirationTime.fromSeconds(90 * 86400))
  const g = fakeChain([dashboardRow(), linkRow({ key: L1 }), linkRow({ key: L2, expiresAt: 1000 }), linkRow({ key: L3, dashboard: K })])
  await updateDashboard(g.deps, S, D, { title: 'Rename', description: 'Description' })
  expect(g.calls[0].method).toBe('patch')
  expect(g.calls[0].data.set).toEqual({ title: 'Rename' })
  expect(payload(g.calls[0].data)).toEqual({ v: 1, title: 'Rename', description: 'Description' })
  await deleteDashboard(g.deps, S, D)
  expect(g.calls[1]).toEqual({ method: 'batch', data: { deletes: [{ entityKey: D }, { entityKey: L1 }] } })
})
test('all dashboard mutations require a live trusted dashboard owned by caller', async () => {
  for (const [rows, code] of [[[dashboardRow({ user: OTHER })], 'forbidden'], [[], 'not_found'], [[dashboardRow({ expiresAt: 1000 })], 'not_found'], [[dashboardRow({ creator: OTHER })], 'not_found']] as const) {
    const f = fakeChain([...rows])
    for (const run of [() => updateDashboard(f.deps, S, D, { title: 'New' }), () => deleteDashboard(f.deps, S, D), () => organizeDashboard(f.deps, S, D, { items: [] }), () => addLink(f.deps, S, D, { widget: K, size: 'md' })]) {
      await expect(run()).rejects.toMatchObject({ code }); expect(f.calls).toEqual([])
    }
  }
})
test('addLink appends at max position with dashboard expiry and authoritative widget name', async () => {
  const f = fakeChain([dashboardRow(), linkRow({ widget: W2, position: 4 }), widgetRow()])
  expect(await addLink(f.deps, S, D, { widget: K, size: 'sm' })).toMatchObject({ linkKey: PREDICTED_1, afterBlock: 1000 })
  expect(f.queries).toEqual([dashboardBundleExpr(W, D, [K])])
  expect(f.calls.map(c => c.method)).toEqual(['create'])
  expect(payload(f.calls[0].data)).toEqual({ v: 1, size: 'sm', position: 5, name: validWidget.name })
  expect(f.calls[0].data.expires).toEqual(ExpirationTime.atBlock(BigInt(5000)))
  for (const [rows, code] of [ [[dashboardRow(), widgetRow(), linkRow()], 'conflict'], [[dashboardRow(), widgetRow({ expiresAt: 1000 })], 'not_found'], [[dashboardRow(), widgetRow({ creator: OTHER })], 'not_found'], [[dashboardRow(), widgetRow(), ...Array.from({ length: 48 }, (_, i) => linkRow({ key: `0x${i.toString(16).padStart(64, '0')}`, widget: W2 }))], 'full'] ] as const) {
    const g = fakeChain([...rows]); await expect(addLink(g.deps, S, D, { widget: K, size: 'md' })).rejects.toMatchObject({ code }); expect(g.calls).toEqual([])
  }
})
test('organize rejects expired or foreign imports before any write', async () => {
  for (const row of [widgetRow({ expiresAt: 1000 }), widgetRow({ creator: OTHER })]) {
    const f = fakeChain([dashboardRow(), row])
    await expect(organizeDashboard(f.deps, S, D, { items: [{ link: null, widget: K, size: 'md' }] })).rejects.toMatchObject({ code: 'not_found', status: 404 })
    expect(f.calls).toEqual([])
  }
})
test('dashboard reads and writes wait for their queue slot', async () => {
  const f = fakeChain([dashboardRow(), widgetRow()])
  let release!: () => void
  const held = f.deps.queue.run(() => new Promise<void>(resolve => { release = resolve }))
  const pending = addLink(f.deps, S, D, { widget: K, size: 'md' })
  await Promise.resolve()
  expect(f.queries).toEqual([]); expect(f.calls).toEqual([])
  release(); await held; await pending
  expect(f.queries).toHaveLength(1); expect(f.calls).toHaveLength(1)
})
