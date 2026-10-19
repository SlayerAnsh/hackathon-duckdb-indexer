import { expect, test } from 'bun:test'
import { ExpirationTime } from '@arkiv-network/sdk'
import { addr, key } from '@arkiv-network/sdk/attr'
import { RpcError } from '@asi/core'
import { createWidget, updateWidget, extendWidget, deleteWidget, extendTarget } from '../lib/dash/server/operations'
import { dashboardBundleExpr, keysExprs, widgetExtendExpr } from '../lib/dash/entities'
import { fakeChain, widgetRow, dashboardRow, linkRow, validWidget, U, OTHER, K, D, W, PREDICTED_1, PREDICTED_2 } from './dash-fakes'
const S = { address: U, login: 'google' as const, exp: 9e9 }
const payload = (data: any) => JSON.parse(new TextDecoder().decode(data.payload))

test('extend target adds the lifetime but caps at 90 days remaining', () => {
  expect(extendTarget(1000 + 43200, 1000, 7)).toBe(1000 + 8 * 43200)
  expect(extendTarget(1000 + 89 * 43200, 1000, 7)).toBe(1000 + 90 * 43200)
})
test('create widget without a dashboard is one createEntity with attributes and JSON payload', async () => {
  const { deps, calls } = fakeChain([])
  const r = await createWidget(deps, S, { widget: validWidget })
  expect(calls.map(c => c.method)).toEqual(['create'])
  expect(calls[0].data.attributes).toEqual({ type: 'widget', project: 'arkiv-sql-indexer-dash', user: addr(U), login: 'google', name: 'Top 10 creators', chart: 'hbar' })
  expect(calls[0].data.contentType).toBe('application/json')
  expect(payload(calls[0].data)).toEqual(validWidget)
  expect(calls[0].data.expires).toEqual(ExpirationTime.fromSeconds(7 * 86400))
  expect(r).toEqual({ txHash: '0xtx', afterBlock: 1000, key: PREDICTED_1, expiresAt: 0 })
})
test('create with add to dashboard is one batch referencing predicted keys and dashboard expiry', async () => {
  const { deps, calls, queries } = fakeChain([dashboardRow(), linkRow({ position: 4 })])
  const r = await createWidget(deps, S, { widget: validWidget, addTo: { dashboard: D, size: 'xl' } })
  expect(queries).toEqual([dashboardBundleExpr(W, D)])
  expect(calls.map(c => c.method)).toEqual(['batch'])
  const [w, l] = calls[0].data.creates
  expect(w.salt).toBe(BigInt(1)); expect(l.salt).toBe(BigInt(2))
  expect(payload(w)).toEqual(validWidget)
  expect(w.expires).toEqual(ExpirationTime.fromSeconds(7 * 86400))
  expect(l.attributes).toEqual({ type: 'link', project: 'arkiv-sql-indexer-dash', user: addr(U), dashboard: key(D), widget: key(PREDICTED_1) })
  expect(payload(l)).toEqual({ v: 1, size: 'xl', position: 5, name: 'Top 10 creators' })
  expect(l.expires).toEqual(ExpirationTime.atBlock(BigInt(5000)))
  expect(r).toMatchObject({ key: PREDICTED_1, linkKey: PREDICTED_2, afterBlock: 1000 })
})
test('add to dashboard refuses a missing, foreign or full dashboard before writing', async () => {
  for (const [rows, code, status] of [ [[], 'not_found', 404], [[dashboardRow({ user: OTHER })], 'forbidden', 403],
    [[dashboardRow(), ...Array.from({ length: 48 }, (_, i) => linkRow({ key: `0x${i.toString(16).padStart(64, '0')}`, position: i }))], 'full', 409] ] as const) {
    const { deps, calls } = fakeChain([...rows])
    await expect(createWidget(deps, S, { widget: validWidget, addTo: { dashboard: D, size: 'md' } })).rejects.toMatchObject({ code, status })
    expect(calls).toEqual([])
  }
})
test('update keeps lifetime, patches payload and attributes, owner only', async () => {
  const { deps, calls, queries } = fakeChain([widgetRow()])
  const widget = { ...validWidget, name: 'Changed', chart: 'table' as const, lifetimeDays: 90 as const }
  expect(await updateWidget(deps, S, K, widget)).toEqual({ txHash: '0xtx', afterBlock: 1000 })
  expect(queries).toEqual(keysExprs(W, [K]))
  expect(calls.map(c => c.method)).toEqual(['patch'])
  expect(calls[0].data).toEqual({ entityKey: K, set: { name: 'Changed', chart: 'table' }, payload: expect.any(Uint8Array), contentType: 'application/json' })
  expect(payload(calls[0].data)).toEqual({ ...widget, lifetimeDays: 7 })
  for (const [rows, code] of [[[widgetRow({ user: OTHER })], 'forbidden'], [[], 'not_found']] as const) {
    const f = fakeChain([...rows])
    await expect(updateWidget(f.deps, S, K, widget)).rejects.toMatchObject({ code })
    expect(f.calls).toEqual([])
  }
})
test('extend: creator or owner of a live link may extend, capped, never past 90 days', async () => {
  for (const rows of [[widgetRow()], [widgetRow({ user: OTHER }), linkRow()]]) {
    const { deps, calls, queries } = fakeChain(rows)
    const target = extendTarget(5000, 1000, 7)
    expect(await extendWidget(deps, S, K)).toEqual({ txHash: '0xtx', afterBlock: 1000, expiresAt: target })
    expect(queries).toEqual([widgetExtendExpr(W, K, U)])
    expect(calls).toEqual([{ method: 'extend', data: { entityKey: K, expires: ExpirationTime.atBlock(BigInt(target)) } }])
  }
  for (const [rows, code, status] of [ [[widgetRow({ user: OTHER })], 'forbidden', 403], [[widgetRow({ expiresAt: 1000 + 90 * 43200 })], 'at_cap', 409], [[], 'not_found', 404] ] as const) {
    const f = fakeChain([...rows])
    await expect(extendWidget(f.deps, S, K)).rejects.toMatchObject({ code, status })
    expect(f.calls).toEqual([])
  }
})
test('delete is owner only', async () => {
  const f = fakeChain([widgetRow()])
  expect(await deleteWidget(f.deps, S, K)).toEqual({ txHash: '0xtx', afterBlock: 1000 })
  expect(f.calls).toEqual([{ method: 'delete', data: { entityKey: K } }])
  const other = fakeChain([widgetRow({ user: OTHER })])
  await expect(deleteWidget(other.deps, S, K)).rejects.toMatchObject({ code: 'forbidden' })
  expect(other.calls).toEqual([])
})
test('reads and writes happen inside the queue', async () => {
  const f = fakeChain([dashboardRow()])
  let release!: () => void
  const held = f.deps.queue.run(() => new Promise<void>(resolve => { release = resolve }))
  const pending = createWidget(f.deps, S, { widget: validWidget, addTo: { dashboard: D, size: 'md' } })
  await Promise.resolve()
  expect(f.queries).toEqual([]); expect(f.calls).toEqual([])
  release(); await held; await pending
  expect(f.queries).toHaveLength(1); expect(f.calls).toHaveLength(1)
})
test('over broad results cannot authorize unrelated, expired or untrusted entities', async () => {
  for (const rows of [[widgetRow({ key: D })], [widgetRow({ creator: OTHER })], [widgetRow({ expiresAt: 1000 })]]) {
    const f = fakeChain(rows)
    await expect(deleteWidget(f.deps, S, K)).rejects.toMatchObject({ code: 'not_found' })
    expect(f.calls).toEqual([])
  }
  for (const link of [linkRow({ widget: D }), linkRow({ user: OTHER }), linkRow({ expiresAt: 1000 }), linkRow({ creator: OTHER })]) {
    const f = fakeChain([widgetRow({ user: OTHER }), link])
    await expect(extendWidget(f.deps, S, K)).rejects.toMatchObject({ code: 'forbidden' })
    expect(f.calls).toEqual([])
  }
  const f = fakeChain([dashboardRow(), linkRow({ dashboard: K }), linkRow({ user: OTHER }), linkRow({ expiresAt: 1000 })])
  await createWidget(f.deps, S, { widget: validWidget, addTo: { dashboard: D, size: 'md' } })
  expect(payload(f.calls[0].data.creates[1]).position).toBe(0)
})
test('read throttling preserves Retry After and SDK missing errors become not_found', async () => {
  for (const read of ['query', 'blockNumber'] as const) {
    const f = fakeChain([widgetRow()])
    f.deps.reader[read] = async () => { throw new RpcError('Limited', 429, 429, '37') }
    await expect(read === 'query' ? deleteWidget(f.deps, S, K) : createWidget(f.deps, S, { widget: validWidget })).rejects.toMatchObject({ code: 'busy', status: 503, retryAfterSec: 37 })
    expect(f.calls).toEqual([])
  }
  for (const message of ['EntityNotFound', 'EntityExpired', 'Transaction failed: no entity 0xabcdef12…345678 — it may have been deleted, or have expired', 'Transaction failed: entity 0xabcdef12…345678 expired at block 123']) {
    const f = fakeChain([widgetRow()])
    f.deps.client.deleteEntity = async () => { throw new Error(message) }
    await expect(deleteWidget(f.deps, S, K)).rejects.toMatchObject({ code: 'not_found' })
  }
  const f = fakeChain([widgetRow()]), error = new Error('Unknown SDK failure')
  f.deps.client.deleteEntity = async () => { throw error }
  await expect(deleteWidget(f.deps, S, K)).rejects.toBe(error)
})

test('SDK structured missing entity errors are found through causes', async () => {
  for (const error of [new Error('unrelated', { cause: { data: { errorName: 'EntityNotFound' } } }),
    { cause: { cause: { errorName: 'EntityExpired' } } }]) {
    const f = fakeChain([widgetRow()])
    f.deps.client.deleteEntity = async () => { throw error }
    await expect(deleteWidget(f.deps, S, K)).rejects.toMatchObject({ code: 'not_found', status: 404 })
  }
})


test('every user write rejects the app wallet before reading or writing', async () => {
  const { createDashboard, updateDashboard, deleteDashboard, organizeDashboard, addLink } = await import('../lib/dash/server/operations')
  const operations = [
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => createWidget(d, s, { widget: validWidget }),
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => updateWidget(d, s, K, validWidget),
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => extendWidget(d, s, K),
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => deleteWidget(d, s, K),
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => createDashboard(d, s, { title: 'Overview' }),
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => updateDashboard(d, s, D, { title: 'Overview' }),
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => deleteDashboard(d, s, D),
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => organizeDashboard(d, s, D, { items: [] }),
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => addLink(d, s, D, { widget: K, size: 'md' }),
  ]
  for (const operation of operations) {
    const f = fakeChain([])
    f.deps.reader.blockNumber = async () => { throw new Error('Unexpected head read') }
    f.deps.client.predictEntityKeys = async () => { throw new Error('Unexpected prediction') }
    await expect(operation(f.deps, { ...S, address: W.toUpperCase().replace('0X', '0x') as `0x${string}` })).rejects.toMatchObject({ code: 'forbidden', status: 403 })
    expect(f.calls).toEqual([])
    expect(f.queries).toEqual([])
  }
})
