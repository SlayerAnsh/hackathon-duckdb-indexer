import { expect, test } from 'bun:test'
import { activityCountsSql, expiringSoonSql, myDashboardsSql, myWidgetsSql, recentSql } from '../lib/dash/sql'
import { DASH_PROJECT } from '../lib/dash/schema'
import { nativeDb, type NativeRow } from './dash-duckdb'

const W = '0x' + 'ab'.repeat(20), U = '0x' + 'cd'.repeat(20), V = '0x' + 'ef'.repeat(20)
const key = (n: number) => '0x' + n.toString(16).padStart(64, '0')
const builders = [myDashboardsSql, myWidgetsSql, activityCountsSql, expiringSoonSql, recentSql]

test('home builders validate both addresses', () => {
  for (const build of builders) {
    for (const bad of ['0x12', "x' OR 1=1"]) {
      expect(() => build(bad, U)).toThrow()
      expect(() => build(W, bad)).toThrow()
    }
  }
})

test('home SQL scopes live lists, placements and distinct creation and update days', async () => {
  const row = (n: number, type: string, attrs: Record<string, string> = {}, times: Partial<NativeRow> = {}): NativeRow => ({
    key: key(n), creator: W, owner: attrs.user ?? U, created_at: 100, updated_at: 100, expires_at: 143201,
    attrs: { project: DASH_PROJECT, user: U, type, ...attrs }, ...times,
  })
  const { db, close } = await nativeDb([
    row(1, 'widget', { name: 'Same day', chart: 'table' }, { created_at: 43201, updated_at: 43202, expires_at: 100001 }),
    row(2, 'widget', { name: 'Two days later', chart: 'bar' }, { updated_at: 86401, expires_at: 143200 }),
    row(3, 'dashboard', { title: 'Overview' }, { created_at: 90000, updated_at: 90000 }),
    row(4, 'link', { dashboard: key(3), widget: key(1) }, { updated_at: 99999 }),
    row(5, 'link', { user: V, dashboard: key(6), widget: key(2) }),
    row(6, 'dashboard', { user: V, title: 'Other dashboard' }),
    row(7, 'widget', { user: V, name: 'Other widget' }),
    row(8, 'link', { dashboard: key(3), widget: key(7) }),
    row(9, 'widget', { name: 'Untrusted' }, { creator: V, expires_at: 100002 }),
    row(10, 'link', { dashboard: key(3), widget: key(1) }, { creator: V }),
    row(11, 'widget', { project: 'other', name: 'Wrong project' }),
  ])
  const query = async (sql: string) => (await db.runAndReadAll(sql)).getRowObjects()
  try {
    await db.run('CREATE TABLE live_head AS SELECT 100000 AS block')
    expect(await query(activityCountsSql(W, U))).toEqual([{
      live_widgets: BigInt(2), live_dashboards: BigInt(1), placements: BigInt(2), active_days: BigInt(3),
    }])
    expect((await query(myDashboardsSql(W, U))).map(({ cover, charts, ...row }) => { expect(cover).toBeNull(); expect(charts).toBeDefined(); return row })).toEqual([
      { key: key(3), title: 'Overview', widgets: BigInt(2), updated_at: BigInt(90000), expires_at: BigInt(143201) },
    ])
    expect(await query(myWidgetsSql(W, U))).toEqual([
      { key: key(1), name: 'Same day', chart: 'table', expires_at: BigInt(100001), updated_at: BigInt(43202), usr: U, created_at: BigInt(43201), owner: U, uses: BigInt(1) },
      { key: key(2), name: 'Two days later', chart: 'bar', expires_at: BigInt(143200), updated_at: BigInt(86401), usr: U, created_at: BigInt(100), owner: U, uses: BigInt(1) },
    ])
    expect(await query(expiringSoonSql(W, U))).toEqual([
      { key: key(1), type: 'widget', label: 'Same day', expires_at: BigInt(100001) },
      { key: key(2), type: 'widget', label: 'Two days later', expires_at: BigInt(143200) },
    ])
    expect(await query(recentSql(W, U))).toEqual([
      { key: key(3), type: 'dashboard', label: 'Overview', kind: 'Created', updated_at: BigInt(90000) },
      { key: key(2), type: 'widget', label: 'Two days later', kind: 'Patched', updated_at: BigInt(86401) },
      { key: key(1), type: 'widget', label: 'Same day', kind: 'Patched', updated_at: BigInt(43202) },
    ])
    for (const build of builders) expect(await query(build(W, '0x' + '12'.repeat(20)))).toEqual(
      build === activityCountsSql ? [{ live_widgets: BigInt(0), live_dashboards: BigInt(0), placements: BigInt(0), active_days: BigInt(0) }] : [],
    )
    await db.run(`UPDATE entities SET expires_at = 143200 WHERE key = '${key(3)}'`)
    expect((await query(expiringSoonSql(W, U))).map(r => r.label)).toEqual(['Same day', 'Two days later', 'Overview'])
    // Public views remove expired links. Removing one models that live view change.
    await db.run(`DELETE FROM entities WHERE key = '${key(5)}'`)
    expect(await query(activityCountsSql(W, U))).toMatchObject([{ placements: BigInt(1) }])
    await db.run(`UPDATE attributes SET value = '${U}' WHERE key = '${key(6)}' AND name = 'user'`)
    expect((await query(myDashboardsSql(W, U))).map(r => r.key)).toEqual([key(3), key(6)])
    for (let n = 20; n < 32; n++) {
      await db.run(`INSERT INTO entities SELECT '${key(n)}', owner, creator, 99990, 99990, 100010, content_type, creation_flags, attrs_pending FROM entities WHERE key = '${key(3)}'`)
      await db.run(`INSERT INTO attributes SELECT '${key(n)}', name, type, value, num FROM attributes WHERE key = '${key(3)}'`)
    }
    expect(await query(expiringSoonSql(W, U))).toHaveLength(10)
    expect(await query(recentSql(W, U))).toHaveLength(10)
  } finally { close() }
})

test('SQL distinguishes current widget ownership from authorship', async () => {
 const { dashCte, officialSql, mineSql, widgetListSql, dashboardListSql } = await import('../lib/dash/sql')
 expect(dashCte(W)).toContain('e.owner')
 expect(() => officialSql('d', 'bad')).toThrow()
 expect(() => mineSql('w', 'bad')).toThrow()
 const { db, close } = await nativeDb([
  {key:key(101),creator:W,owner:U,attrs:{project:DASH_PROJECT,type:'widget',user:V,name:'Owned',chart:'table'}},
  {key:key(102),creator:W,owner:V,attrs:{project:DASH_PROJECT,type:'widget',user:U,name:'Authored',chart:'table'}},
  {key:key(103),creator:W,owner:U,attrs:{project:DASH_PROJECT,type:'dashboard',user:W,title:'Transferred'}},
  {key:key(104),creator:W,owner:W,attrs:{project:DASH_PROJECT,type:'dashboard',user:U,title:'Mine'}}
 ])
 const query = async (sql:string) => (await db.runAndReadAll(sql)).getRowObjects()
 try {
  await db.run('CREATE TABLE live_head AS SELECT 99999 AS block')
  expect((await query(myWidgetsSql(W,U))).map(r=>r.key)).toEqual([key(101)])
  expect((await query(myDashboardsSql(W,U))).map(r=>r.key)).toEqual([key(104)])
  expect(await query(activityCountsSql(W,U))).toMatchObject([{live_widgets:BigInt(1),live_dashboards:BigInt(1)}])
  for (const build of [recentSql, expiringSoonSql]) expect((await query(build(W,U))).map(r=>r.key).sort()).toEqual([key(101),key(104)])
  expect(await query(dashboardListSql(W,{search:'',sort:'newest',official:true,limit:12,offset:0}))).toEqual([])
  expect(await query(widgetListSql(W,{search:'',chart:null,sort:'newest',user:U,limit:12,offset:0}))).toMatchObject([{key:key(101),owner:U}])
 } finally { close() }
})
