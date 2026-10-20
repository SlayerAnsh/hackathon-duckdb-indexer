import { test, expect } from 'bun:test'
import { renderToStaticMarkup as rawRender } from 'react-dom/server'
import { QueryProvider } from '../components/QueryProvider'
const renderToStaticMarkup = (node: React.ReactNode) => rawRender(<QueryProvider>{node}</QueryProvider>)
import { DuckDBInstance } from '../../../packages/core/node_modules/@duckdb/node-api'
import { RAW_TABLES_SQL, MERGE_VIEWS_SQL, MATERIALIZE_SQL, setHeadSql } from '@asi/core'
import { FIGURE_SQL, averageMs, readFigure } from '../components/landing/stats'
import { NAV_ITEMS, isActiveRoute, PageNav } from '../components/dash/TopBar'
import { HeroFigures } from '../components/dash/Hero'
import { Closing, Story } from '../components/landing/Story'

test('each landing figure has its own query over the merged views', async () => {
 const instance = await DuckDBInstance.create(':memory:'); const db = await instance.connect()
 try {
  for (const sql of [...RAW_TABLES_SQL, ...MERGE_VIEWS_SQL, ...setHeadSql(50000)]) await db.run(sql)
  await db.run(`INSERT INTO base_entities VALUES
   ('k1','o','c1',49000,49000,50100,NULL,0,false),
   ('k2','o','c1',40000,40000,60000,NULL,0,false),
   ('k3','o','c2',49999,49999,51800,NULL,0,false),
   ('gone','o','c3',49900,49900,49000,NULL,0,false)`)
  for (const sql of MATERIALIZE_SQL) await db.run(sql)
  const values: Record<string, number | undefined> = {}
  for (const [id, sql] of Object.entries(FIGURE_SQL)) {
   const result = await db.runAndReadAll(sql)
   values[id] = readFigure({ columns: result.columnNames(), rows: result.getRows() as unknown[][] })
  }
  expect(values).toEqual({ live: 3, creators: 2, expiring: 2, created: 2 })
 } finally { db.closeSync(); instance.closeSync() }
})

test('figure values are undefined until a result arrives and null becomes zero', () => {
 expect(readFigure(undefined)).toBeUndefined()
 expect(readFigure({ columns: ['value'], rows: [[BigInt(4)]] })).toBe(4)
 expect(readFigure({ columns: ['value'], rows: [[null]] })).toBe(0)
})

test('average query time ignores figures that have not been measured yet', () => {
 expect(averageMs([])).toBeUndefined()
 expect(averageMs([undefined, undefined])).toBeUndefined()
 expect(averageMs([2, 4, undefined, 3])).toBe(3)
})

test('nav marks exactly the active route', () => {
 expect(NAV_ITEMS.map(i => i.href)).toEqual(['/', '/explore', '/playground', '/about'])
 const explore = NAV_ITEMS[1]
 for (const path of ['/explore', '/widgets/0xabc', '/widgets/new']) expect(isActiveRoute(path, explore)).toBe(true)
 for (const path of ['/', '/me', '/explorer', '/d/0xabc', '/d/0xabc/edit']) expect(isActiveRoute(path, explore)).toBe(false)
 expect(isActiveRoute('/', NAV_ITEMS[0])).toBe(true)
 expect(isActiveRoute('/me', NAV_ITEMS[0])).toBe(false)
 expect(isActiveRoute(null, NAV_ITEMS[0])).toBe(false)
 const html = renderToStaticMarkup(<PageNav pathname="/playground"/>)
 expect(html.match(/aria-current="page"/g)).toHaveLength(1)
 expect(html).toContain('Home'); expect(html).toContain('Explore')
})

test('hero figures show placeholders while loading and the measured time once ready', () => {
 const loading = renderToStaticMarkup(<HeroFigures/>)
 expect(loading).toContain('Live entities'); expect(loading).toContain('Loading'); expect(loading).toContain('Measuring query time')
 const ready = renderToStaticMarkup(<HeroFigures stats={{ live: 30700, creators: 12, expiring: 0, created: 1500 }} times={{ live: 2.04, creators: 4.4, expiring: 2.6, created: 3.1 }}/>)
 expect(ready).toContain('30.7k'); expect(ready).toContain('12'); expect(ready).toContain('1.5k'); expect(ready).not.toContain('Loading')
 expect(ready).toContain('2.0 ms'); expect(ready).toContain('4.4 ms')
 expect(ready).toContain('avg 3.0 ms')
})

test('landing story explains how it works, what you can build and how to run your own indexer', () => {
 const html = renderToStaticMarkup(<><Story/><Closing/></>)
 const text = html.replace(/<[^>]+>/g, ' ')
 for (const h of ['How it works', 'What you can build', 'Check it yourself', 'Run your own indexer']) expect(text).toContain(h)
 for (const step of ['Arkiv chain', 'Indexer', 'Your browser', 'Your dashboards']) expect(text).toContain(step)
 for (const stage of ['Save', 'Transferred to you', 'Extend, transfer or delete', 'Expires']) expect(text).toContain(stage)
 for (const href of ['/widgets/new', '/explore', '/playground', '/about', 'https://github.com/']) expect(html).toContain(`href="${href}`)
 expect(html.indexOf('how-h')).toBeLessThan(html.indexOf('build-h'))
 expect(text).not.toMatch(/[—–]| - /)
})


test('official landing band covers disabled, loading, populated and empty states', async () => {
 const { OfficialDashboardsView } = await import('../components/landing/OfficialDashboards')
 const render = renderToStaticMarkup
 expect(render(<OfficialDashboardsView enabled={false} items={null}/>)).toBe('')
 const loading = render(<OfficialDashboardsView enabled items={null}/>)
 expect(loading).toContain('aria-busy="true"')
 expect(loading.match(/data-skeleton="true"/g)).toHaveLength(3)
 const items = ['First report', 'Second report'].map((title,i) => ({ owner: "wallet", cover: null, key: 'key'+i, title, user: 'wallet', official: true, widgets: 2, charts: [] as [], createdAt: 1, updatedAt: 1, expiresAt: 100 }))
 const html = render(<OfficialDashboardsView enabled items={items} descriptions={new Map([['key0','Network description']])}/>)
 for (const text of ['Featured dashboards','Live network reports kept on Arkiv by this app. Open one to see every chart and its SQL.','All dashboards','href="/explore"','Network description']) expect(html).toContain(text)
 expect(html.indexOf('First report')).toBeLessThan(html.indexOf('Second report'))
 expect(html.match(/<article/g)).toHaveLength(2)
 const empty = render(<OfficialDashboardsView enabled items={[]}/>)
 expect(empty).toContain('Featured dashboards are on their way')
 expect(empty).not.toContain('not set up on this deployment')
 for (const text of ['Browse community dashboards', 'href="/explore"', 'role="status"']) expect(empty).toContain(text)
 expect(empty).not.toContain('href="/playground"')
})

test('landing hero and Home use the official reports band', async () => {
 const { Home } = await import('../components/landing/Home')
 const { DashAuthContext } = await import('../components/auth/DashAuthProvider')
 const { readFileSync } = await import('node:fs')
 const defaults = { status: 'anonymous', config: { enabled: true, wallet: '0x'+'a'.repeat(40), rpcUrl: '', privyAppId: 'test' }, requestLogin: async () => false }
 const { AppRouterContext } = await import('next/dist/shared/lib/app-router-context.shared-runtime')
 const html = renderToStaticMarkup(<AppRouterContext.Provider value={{} as any}><DashAuthContext.Provider value={defaults as any}><Home closing="Closing marker">Story marker</Home></DashAuthContext.Provider></AppRouterContext.Provider>)
 for (const text of ['Explore live Arkiv data, in SQL.','Explore dashboards','href="/explore"','Open playground','href="/playground"']) expect(html).toContain(text)
 expect(html).not.toContain('/showcase')
 expect(html.indexOf('hero-h')).toBeLessThan(html.indexOf('Featured dashboards'))
 expect(html.indexOf('Featured dashboards')).toBeLessThan(html.indexOf('Story marker'))
 expect(html.indexOf('Story marker')).toBeLessThan(html.indexOf('Creates, updates and deletions'))
 expect(html.indexOf('Creates, updates and deletions')).toBeLessThan(html.indexOf('Closing marker'))
 const source = readFileSync(new URL('../components/landing/Home.tsx', import.meta.url),'utf8')
 expect(source).not.toContain('PreviewCards')
 expect(source).toContain('OfficialDashboards')
})
