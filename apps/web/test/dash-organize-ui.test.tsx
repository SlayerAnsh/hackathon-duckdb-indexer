import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { organizeAccess, leaveGuard, NotOwner, tileStatus, AddTile, EditBar } from '../components/widgets/OrganizeBoard'
import { OrganizeTileFooter, OrganizeTileHeader } from '../components/widgets/OrganizeRow'
import type { WidgetEntity } from '../lib/dash/entities'
import { BLOCKS_PER_DAY } from '../lib/dash/schema'
import type { DashboardData } from '../lib/dash/use-dashboard'
import type { DraftItem } from '../lib/dash/organize-state'

const user = '0x' + 'ab'.repeat(20)
const data = { status: 'ready', dashboard: { user }, widgets: new Map(), links: [], reload() {} } as unknown as DashboardData
const item: DraftItem = { id: 'link', link: 'link', widget: 'widget', name: 'Top 10 creators', owner: user, chart: 'hbar', size: 'md', imported: false, expiresAt: null, lifetimeDays: null, expired: false, flash: false }
test('organize access waits for loading and restricts ownership', () => {
 expect(organizeAccess({ auth: 'loading', data })).toBe('loading')
 expect(organizeAccess({ auth: 'authenticated', address: user, data: { ...data, status: 'loading' } })).toBe('loading')
 expect(organizeAccess({ auth: 'anonymous', data })).toBe('login')
 expect(organizeAccess({ auth: 'authenticated', address: 'other', data })).toBe('not_owner')
 expect(organizeAccess({ auth: 'authenticated', address: user, data: { ...data, status: 'missing', dashboard: null } })).toBe('missing')
 expect(organizeAccess({ auth: 'authenticated', address: user.toUpperCase(), data })).toBe('owner')
})
test('leave guard confirms only a dirty draft with exact copy', () => {
 let calls = 0
 expect(leaveGuard(false, () => { calls++; return false })).toBe(true)
 expect(calls).toBe(0)
 expect(leaveGuard(true, message => { expect(message).toBe('Leave without saving your changes?'); return false })).toBe(false)
 expect(leaveGuard(true, () => true)).toBe(true)
})
test('tile strips expose accessible reorder, size steps and removal', () => {
 const header = render(<OrganizeTileHeader item={item} index={0} count={1} onRemove={() => {}}/>)
 for (const text of ['aria-label="Reorder Top 10 creators"', 'aria-label="Remove Top 10 creators"', 'Position 1 of 1']) expect(header).toContain(text)
 const footer = render(<OrganizeTileFooter item={item} onResize={() => {}}/>)
 for (const text of ['aria-label="Size of Top 10 creators"', '>XS<', '>S<', '>M<', '>XL<', 'Half width', '<select']) expect(footer).toContain(text)
 expect(footer.match(/aria-pressed="true"/g)?.length).toBe(1)
 expect(render(<OrganizeTileFooter item={{ ...item, expiresAt: 30 * BLOCKS_PER_DAY, lifetimeDays: 7 }} head={1} onResize={() => {}}/>)).toContain('title="29d 23h left"')
 const expired = render(<OrganizeTileFooter item={{ ...item, expired: true }} onResize={() => {}}/>)
 expect(expired).toContain('Expired')
 expect(expired.match(/disabled=""/g)?.length).toBe(5)
 expect(render(<OrganizeTileHeader item={{ ...item, expired: true }} index={0} count={1} onRemove={() => {}}/>)).not.toContain('aria-label="Remove Top 10 creators" disabled')
})
test('tile status follows the draft, the live head and the widget fetch', () => {
 const widget = { expiresAt: 100 } as WidgetEntity
 expect(tileStatus(item, widget, true, 50)).toBe('live')
 expect(tileStatus(item, widget, true, 100)).toBe('expired')
 expect(tileStatus({ ...item, expired: true }, widget, true, 0)).toBe('expired')
 expect(tileStatus(item, undefined, false, 0)).toBe('loading')
 expect(tileStatus(item, undefined, true, 0)).toBe('expired')
})
test('the add tile offers import and a new widget that returns to this dashboard', () => {
 const empty = render(<AddTile empty remaining={48} newHref="/widgets/new?dashboard=key" onImport={() => {}} mine={3}/>)
 for (const text of ['Add the first widget', 'press Done to save the layout', 'Add a saved widget', 'your 3 saved widgets', 'Write a new widget', 'href="/widgets/new?dashboard=key"', '--lg:12']) expect(empty).toContain(text)
 const closed = render(<AddTile empty={false} remaining={10} newHref="/widgets/new" onImport={() => {}}/>)
 expect(closed).toContain('Add widget')
 expect(closed).toContain('--lg:6')
 expect(render(<AddTile empty={false} size="xs" remaining={10} newHref="/widgets/new" onImport={() => {}}/>)).toContain('--lg:3')
 expect(closed).not.toContain('Write a new widget')
 expect(render(<AddTile empty={false} remaining={0} newHref="/widgets/new" onImport={() => {}}/>)).toContain('This dashboard is full')
})
test('the edit bar shows slots, unsaved state, Cancel and Done', () => {
 const clean = render(<EditBar count={3} dirty={false} saving={false} canSave dashboardKey="key" onDone={() => {}}/>)
 for (const text of ['Editing layout', '3 of 48 slots', 'No changes', 'href="/d/key"', 'Cancel', '>Done<']) expect(clean).toContain(text)
 expect(render(<EditBar count={3} dirty saving={false} canSave dashboardKey="key" onDone={() => {}}/>)).toContain('Unsaved changes')
 const saving = render(<EditBar count={3} dirty saving canSave dashboardKey="key" onDone={() => {}}/>)
 expect(saving).toContain('Saving…')
 expect(saving).toContain('aria-busy="true"')
})
test('not owner state links back to the dashboard', () => {
 const html = render(<NotOwner dashboardKey="key"/>)
 expect(html).toContain('Only the owner can organize this dashboard.')
 expect(html).toContain('View dashboard')
 expect(html).toContain('href="/d/key"')
})

import { canExtendRow, isDirty, toOrganizeInput } from '../lib/dash/organize-state'
import { OrganizeTitle } from '../components/widgets/OrganizeBoard'
test('extend requires login and a live widget', () => {
 expect(canExtendRow({ link: null, widgetUser: user, expired: false }, user)).toBe(true)
 expect(canExtendRow({ link: 'link', widgetUser: 'other', expired: false }, user)).toBe(true)
 expect(canExtendRow({ link: null, widgetUser: 'other', expired: false }, user)).toBe(true)
 expect(canExtendRow({ link: 'link', widgetUser: user, expired: true }, user)).toBe(false)
 expect(canExtendRow({ link: null, widgetUser: user, expired: false }, null)).toBe(false)
})
test('title whitespace is not a change and input requires at most 80 characters', () => {
 const original = { title: 'Title', items: [] }
 const draft = { ...original, title: 'Title ' }
 expect(isDirty(draft, original)).toBe(false)
 expect(toOrganizeInput(draft, original)).not.toHaveProperty('title')
 const html = render(<OrganizeTitle value="Title" disabled={false} onChange={() => {}}/>)
 expect(html).toContain('maxLength="80"')
 expect(html).toContain('required=""')
})
