import { keysetExpr } from '../lib/dash/entities'
import { LinkSchema, WidgetSchema } from '../lib/dash/arkiv-schemas'
import { expect, test } from 'bun:test'
import { ExpirationTime } from '@arkiv-network/sdk'
import { addr, key } from '@arkiv-network/sdk/schema'
import { RpcError } from '@asi/core'
import { createWidget, write } from '../lib/dash/server/operations'
import { dashboardBundleExpr, widgetVersionExpr } from '../lib/dash/entities'
import { fakeChain, widgetRow, dashboardRow, linkRow, validWidget, U, OTHER, K, D, W, PREDICTED_1, PREDICTED_2 } from './dash-fakes'
const S = { address: U, login: 'google' as const, exp: 9e9 }
const payload = (data: any) => JSON.parse(new TextDecoder().decode((data.values ?? data.set).payload))

test('create widget without a dashboard is one transferred readonly batch with attributes and JSON payload', async () => {
  const { deps, calls } = fakeChain([])
  const r = await createWidget(deps, S, { widget: validWidget })
  expect(calls.map(c => c.method)).toEqual(['batch'])
  expect(calls[0].data.creates).toHaveLength(1)
  expect(calls[0].data.creates[0].flags).toEqual({ readonly: true, permissionlessExtension: true })
  expect(calls[0].data.creates[0].salt).toBe(BigInt(1))
  expect(calls[0].data.patches ?? []).toEqual([])
  expect(calls[0].data.ownershipChanges).toEqual([{ entityKey: PREDICTED_1, newOwner: U }])
  expect(calls[0].data.creates[0].values).toEqual({ payload: expect.any(Uint8Array), type: 'widget', project: 'arkiv-sql-indexer-dash', user: addr(U), login: 'google', name: 'Top 10 creators', chart: 'hbar' })
  expect(calls[0].data.creates[0].schema).toBe(WidgetSchema)
  expect(payload(calls[0].data.creates[0])).toEqual(validWidget)
  expect(calls[0].data.creates[0].expiration).toEqual(ExpirationTime.fromSeconds(7 * 86400))
  expect(r).toEqual({ txHash: '0xtx', afterBlock: 1000, key: PREDICTED_1, expiresAt: 1000 + 7 * 43200 })
})
test('create with add to dashboard is one batch referencing predicted keys and dashboard expiry', async () => {
  const { deps, calls, queries } = fakeChain([dashboardRow(), linkRow({ position: 4 })])
  const r = await createWidget(deps, S, { widget: validWidget, addTo: { dashboard: D, size: 'xl' } })
  expect(queries).toEqual([keysetExpr(dashboardBundleExpr(W, D), null)])
  expect(calls.map(c => c.method)).toEqual(['batch'])
  const [w, l] = calls[0].data.creates
  expect(w.schema).toBe(WidgetSchema); expect(l.schema).toBe(LinkSchema)
  expect(w.flags).toEqual({ readonly: true, permissionlessExtension: true }); expect(l).not.toHaveProperty('flags')
  expect(calls[0].data.ownershipChanges).toEqual([{ entityKey: PREDICTED_1, newOwner: U }])
  expect(w.salt).toBe(BigInt(1)); expect(l.salt).toBe(BigInt(2))
  expect(payload(w)).toEqual(validWidget)
  expect(w.expiration).toEqual(ExpirationTime.fromSeconds(7 * 86400))
  expect(l.values).toEqual({ payload: expect.any(Uint8Array), type: 'link', project: 'arkiv-sql-indexer-dash', user: addr(U), dashboard: key(D), widget: key(PREDICTED_1) })
  expect(payload(l)).toEqual({ v: 1, size: 'xl', position: 5, name: 'Top 10 creators' })
  expect(l.expiration).toEqual(ExpirationTime.atBlock(BigInt(5000)))
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
  const f = fakeChain([dashboardRow(), linkRow({ dashboard: K }), linkRow({ user: OTHER }), linkRow({ expiresAt: 1000 })])
  await createWidget(f.deps, S, { widget: validWidget, addTo: { dashboard: D, size: 'md' } })
  expect(payload(f.calls[0].data.creates[1]).position).toBe(0)
})
test('read throttling preserves Retry After and SDK missing errors become not_found', async () => {
  for (const read of ['query', 'blockNumber'] as const) {
    const f = fakeChain([widgetRow()])
    f.deps.reader[read] = async () => { throw new RpcError('Limited', 429, 429, '37') }
    await expect(read === 'query' ? createWidget(f.deps, S, { widget: validWidget, replaces: K }) : createWidget(f.deps, S, { widget: validWidget })).rejects.toMatchObject({ code: 'busy', status: 503, retryAfterSec: 37 })
    expect(f.calls).toEqual([])
  }
  for (const message of ['EntityNotFound', 'EntityExpired', 'Transaction failed: no entity 0xabcdef12…345678 — it may have been deleted, or have expired', 'Transaction failed: entity 0xabcdef12…345678 expired at block 123']) {
    const fail = async () => { throw new Error(message) }
    await expect(write(fail)).rejects.toMatchObject({ code: 'not_found' })
  }
  const error = new Error('Unknown SDK failure')
  const fail = async () => { throw error }
  await expect(write(fail)).rejects.toBe(error)
})

test('SDK structured missing entity errors are found through causes', async () => {
  for (const error of [new Error('unrelated', { cause: { data: { errorName: 'EntityNotFound' } } }),
    { cause: { cause: { errorName: 'EntityExpired' } } }]) {
    const fail = async () => { throw error }
    await expect(write(fail)).rejects.toMatchObject({ code: 'not_found', status: 404 })
  }
})


test('every user write rejects the app wallet before reading or writing', async () => {
  const { createDashboard, updateDashboard, deleteDashboard, organizeDashboard, addLink } = await import('../lib/dash/server/operations')
  const operations = [
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => createWidget(d, s, { widget: validWidget }),
    (d: ReturnType<typeof fakeChain>['deps'], s: typeof S) => createWidget(d, s, { widget: validWidget, replaces: K }),
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

test('replacement patches only live trusted links by the session and transfers the new widget', async () => {
 const L1 = '0x' + '44'.repeat(32)
 const f = fakeChain([widgetRow({ owner: U }), linkRow({ key: L1, position: 2 }), linkRow({ key: D, user: OTHER }), linkRow({ key: K, expiresAt: 999 }), linkRow({ key: PREDICTED_2, creator: OTHER })])
 const result = await createWidget(f.deps, S, { widget: validWidget, replaces: K })
 expect(f.queries).toEqual([keysetExpr(widgetVersionExpr(W, K, U), null)])
 expect(f.calls.map(c => c.method)).toEqual(['batch'])
 const batch = f.calls[0].data
 expect(batch.creates).toHaveLength(1)
 expect(batch.creates[0].flags).toEqual({ readonly: true, permissionlessExtension: true })
 expect(batch.ownershipChanges).toEqual([{ entityKey: PREDICTED_1, newOwner: U }])
 expect(batch.patches).toHaveLength(1)
 expect(batch.patches[0]).toMatchObject({ entityKey: L1, set: { widget: key(PREDICTED_1) }, schema: LinkSchema })
 expect(payload(batch.patches[0])).toEqual({ v: 1, size: 'md', position: 2, name: validWidget.name })
 expect(result.relinked).toEqual([L1])
})
test('replacement refusals send nothing and use ownership rather than authorship', async () => {
 for (const [rows, code] of [
  [[widgetRow({ owner: OTHER })], 'forbidden'], [[], 'not_found'],
  [[widgetRow({ owner: U, expiresAt: 1000 })], 'not_found'], [[widgetRow({ owner: U, creator: OTHER })], 'not_found'],
  [[widgetRow({ owner: U }), ...Array.from({ length: 49 }, (_, i) => linkRow({ key: '0x' + i.toString(16).padStart(64, '0') }))], 'conflict'],
 ] as const) {
  const f = fakeChain([...rows])
  await expect(createWidget(f.deps, S, { widget: validWidget, replaces: K })).rejects.toMatchObject({ code })
  expect(f.calls).toEqual([])
 }
 const f = fakeChain([])
 await expect(createWidget(f.deps, S, { widget: validWidget, replaces: K, addTo: { dashboard: D, size: 'md' } })).rejects.toMatchObject({ code: 'invalid' })
 expect(f.calls).toEqual([])
 const owned = fakeChain([widgetRow({ owner: U, user: OTHER })])
 await createWidget(owned.deps, S, { widget: validWidget, replaces: K })
 expect(owned.calls).toHaveLength(1)
})
