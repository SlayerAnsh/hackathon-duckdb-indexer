import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { dashboardSlots } from '../lib/dash/slots'
import type { LinkEntity, WidgetEntity } from '../lib/dash/entities'
import { ReportHeader, EmptyDashboard, MissingDashboard } from '../components/widgets/DashboardView'
import { shortHex } from '../lib/format'

const user = '0x' + 'ab'.repeat(20)
const key = '0x' + '11'.repeat(32)
const links = [
 { key: 'second', widgetKey: 'w2', link: { name: 'Stored second', size: 'xl', position: 2 } },
 { key: 'first', widgetKey: 'w1', link: { name: 'Stored first', size: 'xs', position: 2 } },
] as LinkEntity[]

test('slots preserve the supplied order, including equal positions, and stored layout', () => {
 const widget = { key: 'w1', name: 'New name' } as WidgetEntity
 const slots = dashboardSlots(links, new Map([['w1', widget]]))
 expect(slots).toEqual([
  { id: 'second', linkKey: 'second', widgetKey: 'w2', name: 'Stored second', size: 'xl', status: 'expired', widget: null },
  { id: 'first', linkKey: 'first', widgetKey: 'w1', name: 'Stored first', size: 'xs', status: 'live', widget },
 ])
 expect(dashboardSlots(links, null).map(slot => slot.status)).toEqual(['loading', 'loading'])
 expect(dashboardSlots([], new Map())).toEqual([])
})

test('report header has public facts and quiet owner actions', () => {
 const props = { title: 'My dashboard', description: 'A live report', user, count: 8, dashboardKey: key, updatedAt: 1, head: 61, official: false }
 const owner = render(<ReportHeader {...props} owner/>)
 for (const text of ['My dashboard', shortHex(user), '8 widgets', 'Organize dashboard', 'Add widgets', 'Share dashboard', 'role="toolbar"', 'aria-label="Dashboard actions"', 'Updated 2 min ago', 'Live, computed in your browser', 'href="/explore"', 'href="/explore?tab=dashboards"', 'A live report']) expect(owner).toContain(text)
 expect(owner).not.toContain('btn-primary')
 const official = render(<ReportHeader {...props} official owner/>)
 for (const text of ['Official', 'Network report', 'By', 'Arkiv SQL Indexer']) expect(official).toContain(text)
 expect(official).not.toContain('Organize dashboard')
 const blank = render(<ReportHeader {...props} description="   " owner={false}/>)
 expect(blank).not.toMatch(/<p[ >]/)
 expect(owner).toContain(`href="/d/${key}/edit"`)
 expect(owner).toContain(`href="/d/${key}/edit?import=1"`)
})

test('empty and missing states use the specified copy and destinations', () => {
 const owner = render(<EmptyDashboard owner dashboardKey={key}/>)
 expect(owner).toContain('This dashboard is empty.')
 expect(owner).toContain('+ Add widget')
 expect(owner).toContain(`/d/${key}/edit?import=1`)
 const viewer = render(<EmptyDashboard owner={false} dashboardKey={key}/>)
 expect(viewer).toContain('This dashboard has no widgets yet.')
 expect(viewer).not.toContain('+ Add widget')
 const missing = render(<MissingDashboard/>)
 expect(missing).toContain('Dashboard not found. It may have expired or the link is wrong.')
 expect(missing).toContain('href="/explore?tab=widgets"')
 expect(missing).toContain('Browse widgets')
})
