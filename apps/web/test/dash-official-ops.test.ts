import { DashboardSchema, LinkSchema, WidgetSchema } from '../lib/dash/arkiv-schemas'
import { expect, test, spyOn } from 'bun:test'
import { ExpirationTime } from '@arkiv-network/sdk'
import { addr, key } from '@arkiv-network/sdk/schema'
import { OFFICIAL_DASHBOARDS } from '../lib/dash/official-defs'
import { seedOfficial, keepOfficialAlive, readOfficialEnv } from '../lib/dash/server/official'
import { startOfficialKeepalive, startKeepaliveFromEnv, type KeepaliveTimer } from '../lib/dash/server/keepalive'
import { runSeedCli } from '../lib/dash/server/seed-cli'
import { fakeChain, officialDashboardRow, officialWidgetRow, widgetRow, W, U } from './dash-fakes'

const head = 1_000_000
const days = 43200
const entityKey = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as const
const payload = (v: Uint8Array) => JSON.parse(new TextDecoder().decode(v))

test('seed predicts and creates each dashboard, widgets and links in one queued batch', async () => {
  const f = fakeChain([], head)
  const queue = spyOn(f.deps.queue, 'run')
  const predict = spyOn(f.deps.client, 'predictEntityKeys')
  const result = await seedOfficial(f.deps)
  expect(result.created.map(d => d.slug)).toEqual(OFFICIAL_DASHBOARDS.map(d => d.slug))
  expect(queue).toHaveBeenCalledTimes(OFFICIAL_DASHBOARDS.length)
  expect(predict).toHaveBeenCalledTimes(OFFICIAL_DASHBOARDS.length)
  OFFICIAL_DASHBOARDS.forEach((def, i) => {
    const n = def.widgets.length
    expect(predict.mock.calls[i][0]).toEqual({ owner: W, count: 1 + 2 * n })
    const creates = f.calls[i].data.creates
    expect(creates).toHaveLength(1 + 2 * n)
    expect(creates[0].schema).toBe(DashboardSchema)
    expect(creates[0].values).toMatchObject({ type: 'dashboard', user: addr(W), login: 'arkiv', slug: def.slug, cover: key(`0x${(0xa2 + def.cover!).toString(16).padStart(64, '0')}`) })
    def.widgets.forEach((w, j) => {
      expect(creates[j + 1].schema).toBe(WidgetSchema)
      expect(creates[n + j + 1].schema).toBe(LinkSchema)
      expect(creates[j + 1].values).toMatchObject({ type: 'widget', login: 'arkiv' })
      expect(payload(creates[j + 1].values.payload)).toEqual(w.widget)
      expect(creates[n + j + 1].values).toMatchObject({ type: 'link', dashboard: key(result.created[i].key as `0x${string}`), widget: key(`0x${(0xa2 + j).toString(16).padStart(64, '0')}`) })
      expect(payload(creates[n + j + 1].values.payload)).toEqual({ v: 1, size: w.size, position: j, name: w.widget.name })
    })
    creates.forEach((c: any, j: number) => { expect(c.expiration).toEqual(ExpirationTime.fromSeconds(90 * 86400)); expect(c.salt).toBe(BigInt(j + 1)) })
  })
})

test('seed skips only a live official dashboard with the same slug', async () => {
  const def = OFFICIAL_DASHBOARDS.find(d => d.slug === 'creators')!
  for (const row of [officialDashboardRow('creators', { owner: U, expiresAt: head + 1 }), officialDashboardRow('creators', { expiresAt: head + 1 }), officialDashboardRow('creators', { user: U, expiresAt: head + 1 }), officialDashboardRow('creators', { expiresAt: head })]) {
    const f = fakeChain([row], head)
    const predict = spyOn(f.deps.client, 'predictEntityKeys')
    const skipped = row.owner === W && row.attributes!.find(a => a.name === 'user')!.value === W && Number(BigInt(row.expiresAt!)) > head
    const result = await seedOfficial(f.deps, [def])
    expect(result.skipped).toEqual(skipped ? ['creators'] : [])
    expect(f.calls).toHaveLength(skipped ? 0 : 1)
    expect(predict).toHaveBeenCalledTimes(skipped ? 0 : 1)
  }
})

test('all definitions validate before any read or client call', async () => {
  const f = fakeChain([])
  const def = structuredClone(OFFICIAL_DASHBOARDS[0])
  def.widgets[0].widget.sql = 'DELETE FROM x'
  await expect(seedOfficial(f.deps, [OFFICIAL_DASHBOARDS[1], def])).rejects.toThrow(def.slug)
  expect(f.queries).toHaveLength(0)
  expect(f.calls).toHaveLength(0)
  for (const defs of [[{ ...def, slug: 'Bad slug' }], [OFFICIAL_DASHBOARDS[0], OFFICIAL_DASHBOARDS[0]]]) {
    await expect(seedOfficial(f.deps, defs)).rejects.toThrow()
  }
  expect(f.queries).toHaveLength(0)
})

test('keepalive filters live official entities, queues writes and is idempotent', async () => {
  const rows = [officialWidgetRow({ key: entityKey(1), expiresAt: head + 10 * days }), officialWidgetRow({ key: entityKey(2), expiresAt: head + 60 * days }), officialWidgetRow({ key: entityKey(3), expiresAt: head }), widgetRow({ key: entityKey(4), expiresAt: head + days }), officialWidgetRow({ key: entityKey(5), creator: U, expiresAt: head + days })]
  const f = fakeChain(rows, head)
  const queue = spyOn(f.deps.queue, 'run')
  expect(await keepOfficialAlive(f.deps)).toEqual({ checked: 2, extended: 1, txHashes: ['0xtx'] })
  expect(f.calls[0].data.extensions).toEqual([{ entityKey: entityKey(1), expiration: ExpirationTime.atBlock(BigInt(head + 90 * days)) }])
  expect((await keepOfficialAlive(f.deps)).extended).toBe(0)
  expect(f.calls).toHaveLength(1)
  expect(queue).toHaveBeenCalledTimes(2)
})

test('keepalive chunks 120 extensions into 50, 50, 20', async () => {
  const f = fakeChain(Array.from({ length: 120 }, (_, i) => officialWidgetRow({ key: entityKey(i), expiresAt: head + days })), head)
  expect((await keepOfficialAlive(f.deps)).extended).toBe(120)
  expect(f.calls.map(c => c.data.extensions.length)).toEqual([50, 50, 20])
})

test('timer waits for settlement, survives failure, unrefs and stops', async () => {
  const timers: { fn: () => void; ms: number }[] = []
  const logs: string[] = []
  let finish!: () => void
  let runs = 0, unrefs = 0, clears = 0
  const timer = startOfficialKeepalive({ run: () => { runs++; return runs === 1 ? new Promise<void>(r => { finish = r }) : Promise.reject(new Error('offline')) }, setTimer: (fn, ms) => { timers.push({ fn, ms }); return { unref() { unrefs++ } } }, clearTimer: () => { clears++ }, log: s => logs.push(s) })
  expect(timers[0].ms).toBe(60000)
  timers[0].fn()
  expect(timers).toHaveLength(1)
  finish()
  await new Promise(r => setImmediate(r))
  expect(timers[1].ms).toBe(21600000)
  timers[1].fn()
  await new Promise(r => setImmediate(r))
  expect(logs).toEqual(['Official keepalive failed: offline'])
  expect(timers).toHaveLength(3)
  expect(unrefs).toBe(3)
  timer.stop()
  timers[2].fn()
  expect(runs).toBe(2)
  expect(clears).toBe(1)
})

test('build phase never starts keepalive', () => {
  const previous = process.env.NEXT_PHASE
  try {
    process.env.NEXT_PHASE = 'phase-production-build'
    startKeepaliveFromEnv()
    expect(globalThis.__officialKeepalive).toBeUndefined()
  } finally { if (previous === undefined) delete process.env.NEXT_PHASE; else process.env.NEXT_PHASE = previous }
})

test('CLI validates flags and environment, dry runs without writes, and runs keepalive', async () => {
  const logs: string[] = []
  const f = fakeChain([], head)
  const predict = spyOn(f.deps.client, 'predictEntityKeys')
  const io = { makeOps: () => f.deps, log: (line: string) => logs.push(line) }
  expect(await runSeedCli([], {}, io)).toBe(1)
  expect(logs[0]).toContain('DASHBOARD_PRIVATE_KEY')
  expect(await runSeedCli(['--bogus'], {}, io)).toBe(2)
  const env = { DASHBOARD_PRIVATE_KEY: `0x${'01'.repeat(32)}` }
  logs.length = 0
  expect(await runSeedCli(['--dry-run'], env, io)).toBe(0)
  expect(logs).toHaveLength(OFFICIAL_DASHBOARDS.length)
  logs.forEach((s, i) => { expect(s).toContain(OFFICIAL_DASHBOARDS[i].slug); expect(s).toContain('would create') })
  expect(f.calls).toHaveLength(0)
  expect(predict).not.toHaveBeenCalled()
  const queue = spyOn(f.deps.queue, 'run')
  expect(await runSeedCli(['--keepalive'], env, io)).toBe(0)
  expect(queue).toHaveBeenCalledTimes(1)
  expect(logs.join('\n').includes(env.DASHBOARD_PRIVATE_KEY)).toBe(false)
  expect(readOfficialEnv({ DASHBOARD_PRIVATE_KEY: `0x${'00'.repeat(32)}` }).ok).toBe(false)
  expect(readOfficialEnv(env).ok).toBe(true)
})

test('runtime startup is disabled safely and starts only one timer', () => {
  const previousDeps = globalThis.__dashDeps
  const previousTimer = globalThis.__officialKeepalive
  const previousPhase = process.env.NEXT_PHASE
  try {
    delete process.env.NEXT_PHASE
    globalThis.__officialKeepalive = undefined
    globalThis.__dashDeps = { disabled: 'not configured' }
    startKeepaliveFromEnv()
    expect(globalThis.__officialKeepalive).toBeUndefined()
    globalThis.__dashDeps = { ops: fakeChain([]).deps } as Exclude<typeof globalThis.__dashDeps, { disabled: string } | undefined>
    startKeepaliveFromEnv()
    const timer = globalThis.__officialKeepalive as KeepaliveTimer | undefined
    expect(timer).toBeDefined()
    startKeepaliveFromEnv()
    expect(globalThis.__officialKeepalive as KeepaliveTimer | undefined).toBe(timer)
    timer!.stop()
  } finally {
    globalThis.__dashDeps = previousDeps
    globalThis.__officialKeepalive = previousTimer
    if (previousPhase === undefined) delete process.env.NEXT_PHASE; else process.env.NEXT_PHASE = previousPhase
  }
})

test('stopping during a run prevents the next timer', async () => {
  const timers: (() => void)[] = []
  let finish!: () => void
  const timer = startOfficialKeepalive({ run: () => new Promise<void>(r => { finish = r }), setTimer: fn => { timers.push(fn); return {} }, clearTimer: () => {} })
  timers[0]()
  timer.stop()
  finish()
  await new Promise(r => setImmediate(r))
  expect(timers).toHaveLength(1)
})

test('CLI dry run reports existing slugs and failures never log secret values', async () => {
  const env = { DASHBOARD_PRIVATE_KEY: `0x${'01'.repeat(32)}` }
  const logs: string[] = []
  const f = fakeChain([officialDashboardRow('creators', { expiresAt: head + 1 })], head)
  expect(await runSeedCli(['--dry-run'], env, { makeOps: () => f.deps, log: s => logs.push(s) })).toBe(0)
  expect(logs).toContain('creators: exists')
  expect(f.calls).toHaveLength(0)
  expect(await runSeedCli([], env, { makeOps: () => { throw new Error(env.DASHBOARD_PRIVATE_KEY) }, log: s => logs.push(s) })).toBe(1)
  expect(logs.some(s => s.includes(env.DASHBOARD_PRIVATE_KEY))).toBe(false)
})

test('keepalive ignores official looking entities owned by users', async () => {
 const f = fakeChain([officialWidgetRow({ key: entityKey(501), expiresAt: head + 10 * days }), officialWidgetRow({ key: entityKey(502), owner: U, expiresAt: head + 10 * days })], head)
 const result = await keepOfficialAlive(f.deps)
 expect(result.checked).toBe(1)
 expect(f.calls).toHaveLength(1)
 expect(f.calls[0].data.extensions.map((e: any) => e.entityKey)).toEqual([entityKey(501)])
})

test('cover backfill CLI dry runs in either flag order without predicting or broadcasting', async () => {
 const { linkRow, K, D } = await import('./dash-fakes')
 const { setOfficialCovers } = await import('../lib/dash/server/official')
 const rows = [officialDashboardRow('creators'), officialWidgetRow(), linkRow({ user: W, dashboard: D, widget: K })]
 const f = fakeChain(rows)
 const predict = spyOn(f.deps.client, 'predictEntityKeys')
 const env = { DASHBOARD_PRIVATE_KEY: `0x${'01'.repeat(32)}` }
 for (const flags of [['--set-covers', '--dry-run'], ['--dry-run', '--set-covers']]) {
  const logs: string[] = []
  expect(await runSeedCli(flags, env, { makeOps: () => f.deps, log: s => logs.push(s) })).toBe(0)
  expect(logs).toEqual(['Official covers would update 1 dashboards'])
 }
 expect(f.calls).toEqual([])
 expect(predict).not.toHaveBeenCalled()
 expect(await setOfficialCovers(f.deps)).toBe(1)
 expect(f.calls[0].data.patches).toEqual([{ schema: DashboardSchema, entityKey: D, set: { cover: key(K) } }])
 const g = fakeChain(rows)
 await keepOfficialAlive(g.deps)
 expect(g.calls.some(c => c.data.patches?.[0]?.set.cover)).toBe(true)
})
