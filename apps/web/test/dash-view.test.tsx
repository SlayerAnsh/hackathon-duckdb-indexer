import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { dashboardSlots } from '../lib/dash/slots'
import type { LinkEntity, WidgetEntity } from '../lib/dash/entities'
import { DashboardHeader, EmptyDashboard, MissingDashboard } from '../components/widgets/DashboardView'
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

test('header exposes owner actions and public copy link with count grammar', () => {
 const props = { title: 'My dashboard', user, count: 5, dashboardKey: key }
 const owner = render(<DashboardHeader {...props} owner/>)
 for (const text of ['My dashboard', shortHex(user), '5 widgets', 'Organize', '+ Add widget', 'Copy link', `href="/d/${key}/edit"`, `href="/d/${key}/edit?import=1"`]) expect(owner).toContain(text)
 const viewer = render(<DashboardHeader {...props} count={1} owner={false}/>)
 expect(viewer).toContain('1 widget')
 expect(viewer).toContain('Copy link')
 expect(viewer).not.toContain('Organize')
 expect(viewer).not.toContain('+ Add widget')
 expect(viewer).toContain('by ')
 expect(viewer).toContain(' · ')
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
