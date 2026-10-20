import { expect, test } from 'bun:test'
import { renderToStaticMarkup as rawRender } from 'react-dom/server'
import { QueryProvider } from '../components/QueryProvider'
const render = (node: React.ReactNode) => rawRender(<QueryProvider>{node}</QueryProvider>)
import { mergeDashboards, editedAgo } from '../lib/dash/home'
import { DashboardCard } from '../components/widgets/DashboardCard'
import { ActivityPanel } from '../components/widgets/ActivityPanel'
import { HomePage, HomeCollections } from '../components/widgets/HomePage'
import { DashAuthContext, type DashAuth } from '../components/auth/DashAuthProvider'
import type { PendingWrite } from '../lib/dash/pending'
import type { WidgetListItem } from '../lib/dash/sql'

const ME = '0x' + 'ef'.repeat(20)
const widget = (key: string, name: string): WidgetListItem => ({ key, name, chart: 'bar', user: ME, owner: ME, expiresAt: 100, createdAt: 1, updatedAt: 2, uses: 3 })

const pending: PendingWrite = { key: 'new', kind: 'dashboard', op: 'upsert', at: 1, afterBlock: 10, fields: { title: 'New dashboard' } }
test('pending dashboards lead, indexed rows win without duplicates, deletes hide rows', () => {
 expect(mergeDashboards([['old', 'Old', BigInt(4), 100]], [pending])).toEqual([
  { key: 'new', title: 'New dashboard', widgets: 0, updatedAt: null, syncing: true },
  { key: 'old', title: 'Old', widgets: 4, updatedAt: 100, syncing: false },
 ])
 expect(mergeDashboards([['new', 'Indexed', 1, 120]], [pending])).toEqual([{ key: 'new', title: 'Indexed', widgets: 1, updatedAt: 120, syncing: false }])
 expect(mergeDashboards([['old', 'Old', 4, 100]], [{ ...pending, key: 'old', op: 'delete' }])).toEqual([])
 expect(mergeDashboards([], [{ ...pending, kind: 'widget' }])).toEqual([])
})
test('edited age and dashboard card copy', () => {
 expect(editedAgo(null)).toBe('edited just now')
 expect(editedAgo(100, 3700)).toBe('edited 2h ago')
 expect(editedAgo(100)).toBe('edited just now')
 const card = (widgets: number) => render(<DashboardCard item={{ key: 'key', title: 'Title', widgets, updatedAt: 100, syncing: false }} user={ME} head={3700}/> )
 expect(card(4)).toContain('href="/d/key"')
 expect(card(4)).toContain('4 widgets · edited 2h ago')
 expect(card(1)).toContain('1 widget · edited 2h ago')
})
test('activity tiles, tooltip, footnote and empty lists use exact copy', () => {
 const html = render(<ActivityPanel counts={{ live_widgets: 2, live_dashboards: 1, placements: 4, active_days: 3 }} expiring={[]} recent={[]}/> )
 for (const text of ['Live widgets', 'Live dashboards', 'Placements', 'Active days', 'Times your widgets appear on any dashboard', 'Counts cover live entities only.', 'Nothing expiring soon', 'No activity yet']) expect(html).toContain(text)
})
test('activity links entities and displays kind and relative time without transaction hashes', () => {
 const html = render(<ActivityPanel counts={null} expiring={[]} recent={[
  ['widget-key', 'widget', 'Widget', 'Created', 100], ['dashboard-key', 'dashboard', 'Dashboard', 'Patched', 100],
 ]} head={3700}/> )
 for (const text of ['href="/widgets/widget-key"', 'href="/d/dashboard-key"', 'Created', 'Patched', '2h ago']) expect(html).toContain(text)
 expect(html).not.toContain('txHash')
 expect(html).not.toContain('transaction')
})
test('anonymous home shows login gate', () => {
 const auth: DashAuth = { config: null, status: 'anonymous', confirming: false, error: null, sign: async () => { throw Error('unused') }, requestLogin: async () => false, logout: async () => {}, refresh: async () => {} }
 const html = render(<DashAuthContext.Provider value={auth}><HomePage/></DashAuthContext.Provider>)
 expect(html).toContain('Log in to build dashboards')
 expect(html).toContain('Use Google, Discord, X or Telegram. Saving widgets and dashboards is free and nothing personal goes on chain. Your widgets belong to your wallet; extending, transferring or deleting them is signed by it and needs a little GLM.')
})
test('empty home collections use exact copy', () => {
 const html = render(<HomeCollections dashboards={[]} widgets={[]} address={ME} onCreate={() => {}}/> )
 expect(html).toContain('Create your first dashboard')
 expect(html).toContain('No widgets yet')
 expect(html).toContain('New dashboard')
 expect(html).toContain('class="empty-state"')
 const loading = render(<HomeCollections dashboards={[]} widgets={[]} address={ME} onCreate={() => {}} loading/> )
 expect(loading).toContain('data-skeleton="true"')
 expect(loading).not.toContain('Create your first dashboard')
 expect(html).toContain('href="/widgets/new"')
})

test('home shows payload errors and retry inside My widgets while retaining rows and Extend', () => {
 const html = render(<HomeCollections dashboards={[]} widgets={[widget('key', 'Saved widget')]} address={ME} onCreate={() => {}} payloadError="RPC budget exhausted, retry later" onRetry={() => {}} renderExtend={() => <button>Extend</button>}/> )
 expect(html.indexOf('RPC budget exhausted')).toBeGreaterThan(html.indexOf('My widgets'))
 for (const text of ['RPC budget exhausted, retry later', 'Try again', 'Saved widget', 'Extend']) expect(html).toContain(text)
})

test('home dashboard cards share Explore styles and retain syncing', async () => {
 const source = await Bun.file(new URL('../components/widgets/DashboardCard.tsx', import.meta.url)).text()
 expect(source).toContain('../explore/explore.module.css')
 expect(render(<DashboardCard item={{key:'key',title:'Title',widgets:4,updatedAt:100,syncing:true}} user={ME} head={3700}/>)).toContain('Syncing')
})

test('home rows accept owner delete actions and header displays the balance warning', async () => {
 const { HomeHeader } = await import('../components/widgets/HomePage')
 const address = '0x' + 'ef'.repeat(20)
 const html = render(<HomeCollections dashboards={[]} widgets={[widget("one", "First"), widget("two", "Second")]} address={ME} onCreate={() => {}} renderDelete={key => <button data-key={key}>Delete widget</button>}/> )
 expect(html.match(/Delete widget/g)).toHaveLength(2)
 expect(html).toContain('data-key="one"')
 expect(html).toContain('data-key="two"')
 expect(render(<HomeHeader address={address} balance={{wei:BigInt(40000000000000000),level:'low'}}/>)).toContain('Low balance: 0.04 GLM.')
})
test('pending owner changes and deletes hide home widgets until the index catches up', async () => {
 const { visibleWidgetRows } = await import('../components/widgets/HomePage')
 const address = '0x' + 'ef'.repeat(20), other = '0x' + 'ab'.repeat(20)
 const rows = [['stay'], ['gone'], ['moved'], ['received']]
 const writes: PendingWrite[] = [
  {key:'gone',kind:'widget',op:'delete',at:1,afterBlock:10},
  {key:'moved',kind:'widget',op:'upsert',at:1,afterBlock:10,fields:{owner:other}},
  {key:'received',kind:'widget',op:'upsert',at:1,afterBlock:10,fields:{owner:address.toUpperCase()}},
 ]
 expect(visibleWidgetRows(rows,writes,address)).toEqual([rows[0],rows[3]])
})
test('home widgets and dashboards use the shared Explore cards with owner actions and /me facts', () => {
 const html = render(<HomeCollections dashboards={[{ key: 'dash', title: 'Board', widgets: 2, updatedAt: 100, syncing: false, cover: null, charts: ['bar'], expiresAt: 43300 }]} widgets={[widget('key', 'Saved widget')]} address={ME} head={3700} onCreate={() => {}}
  renderExtend={key => <button data-extend={key}>Extend</button>} renderDelete={key => <button data-delete={key}>Delete widget</button>}/> )
 for (const text of ['height:160px', '--lg:4', 'aria-label="Loading preview"', 'Saved widget', 'by ', 'on 3 dashboards', 'Bar', 'href="/widgets/key"', 'data-extend="key"', 'data-delete="key"', '>Open</a>', 'Expired']) expect(html).toContain(text)
 expect(html).not.toContain('Add to dashboard')
 for (const text of ['href="/d/dash"', 'Board', '2 widgets · edited 2h ago', 'data-cover-icons', '0xefef…efef']) expect(html).toContain(text)
 expect(html.indexOf('data-extend')).toBeGreaterThan(html.indexOf('>Open</a>'))
})
test('home widget rows map to Explore list items', async () => {
 const { homeWidgetItems } = await import('../lib/dash/home')
 expect(homeWidgetItems([['0xAB', 'W', 'line', BigInt(500), BigInt(9), ME.toUpperCase(), BigInt(4), ME, BigInt(2)]], ME)).toEqual([{ key: '0xab', name: 'W', chart: 'line', expiresAt: 500, updatedAt: 9, user: ME, createdAt: 4, owner: ME, uses: 2 }])
 expect(homeWidgetItems([['k', 'W', 'bar', 1, null]], ME)[0]).toMatchObject({ user: ME, owner: ME, uses: 0, updatedAt: 0 })
})
