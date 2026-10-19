import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { mergeDashboards, editedAgo } from '../lib/dash/home'
import { DashboardCard } from '../components/widgets/DashboardCard'
import { ActivityPanel } from '../components/widgets/ActivityPanel'
import { HomePage, HomeCollections } from '../components/widgets/HomePage'
import { DashAuthContext, type DashAuth } from '../components/auth/DashAuthProvider'
import type { PendingWrite } from '../lib/dash/pending'

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
 const card = (widgets: number) => render(<DashboardCard item={{ key: 'key', title: 'Title', widgets, updatedAt: 100, syncing: false }} head={3700}/> )
 expect(card(4)).toContain('href="/d/key"')
 expect(card(4)).toContain('4 widgets · edited 2h ago')
 expect(card(1)).toContain('1 widget · edited 2h ago')
})
test('activity tiles, tooltip, footnote and empty lists use exact copy', () => {
 const html = render(<ActivityPanel counts={{ live_widgets: 2, live_dashboards: 1, placements: 4, active_days: 3 }} expiring={[]} recent={[]}/> )
 for (const text of ['Live widgets', 'Live dashboards', 'Placements', 'Active days', 'Times your widgets appear on any dashboard', 'Counts cover live entities only.', 'Nothing expiring soon.', 'No activity yet.']) expect(html).toContain(text)
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
 expect(html).toContain('Use Google, Discord, X or Telegram. You never pay gas or hold tokens, and nothing personal goes on chain.')
})
test('empty home collections use exact copy', () => {
 const html = render(<HomeCollections dashboards={[]} widgets={[]} onCreate={() => {}}/> )
 expect(html).toContain('No dashboards yet. Create one, then add widgets to it.')
 expect(html).toContain('No widgets yet. Write a query and save it as your first widget.')
 expect(html).toContain('+ New dashboard')
 expect(html).toContain('href="/widgets/new"')
})

test('home shows payload errors and retry inside My widgets while retaining rows and Extend', () => {
 const html = render(<HomeCollections dashboards={[]} widgets={[['key', 'Saved widget', 'bar', 100]]} onCreate={() => {}} payloadError="RPC budget exhausted, retry later" onRetry={() => {}} renderExtend={() => <button>Extend</button>}/> )
 expect(html.indexOf('RPC budget exhausted')).toBeGreaterThan(html.indexOf('My widgets'))
 for (const text of ['RPC budget exhausted, retry later', 'Try again', 'Saved widget', 'Extend']) expect(html).toContain(text)
})

test('home dashboard cards share Explore styles and retain syncing', async () => {
 const source = await Bun.file(new URL('../components/widgets/DashboardCard.tsx', import.meta.url)).text()
 expect(source).toContain('../explore/explore.module.css')
 expect(render(<DashboardCard item={{key:'key',title:'Title',widgets:4,updatedAt:100,syncing:true}} head={3700}/>)).toContain('Syncing')
})
