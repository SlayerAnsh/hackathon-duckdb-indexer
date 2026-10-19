import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { organizeAccess, leaveGuard, NotOwner } from '../components/widgets/OrganizeBoard'
import { OrganizeRow } from '../components/widgets/OrganizeRow'
import { LayoutPreview } from '../components/widgets/LayoutPreview'
import type { DashboardData } from '../lib/dash/use-dashboard'
import type { DraftItem } from '../lib/dash/organize-state'
import { shortHex } from '../lib/format'

const user = '0x' + 'ab'.repeat(20)
const data = { status: 'ready', dashboard: { user }, widgets: new Map(), links: [], reload() {} } as unknown as DashboardData
const item: DraftItem = { id: 'link', link: 'link', widget: 'widget', name: 'Top 10 creators', chart: 'hbar', size: 'md', imported: false, expiresAt: null, lifetimeDays: null, expired: false, flash: false }
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
test('rows expose accessible reorder, sizes, imported attribution and removal', () => {
 const html = render(<OrganizeRow item={{ ...item, imported: true }} importedUser={user} index={0} count={1} onResize={() => {}} onRemove={() => {}}/>)
 for (const text of ['aria-label="Reorder Top 10 creators"', 'aria-label="Remove Top 10 creators"', 'XS', 'SM', 'MD', 'XL', 'by ', shortHex(user)]) expect(html).toContain(text)
 const expired = render(<OrganizeRow item={{ ...item, expired: true }} index={0} count={1} onResize={() => {}} onRemove={() => {}}/>)
 expect(expired).toContain('Expired')
 expect(expired).toContain('opacity:0.5')
 expect(expired.match(/disabled=""/g)?.length).toBe(2)
 expect(expired).not.toContain('aria-label="Remove Top 10 creators" disabled')
})
test('layout preview draws schematic blocks with size spans and no queries', () => {
 const html = render(<LayoutPreview items={(['xs', 'sm', 'md', 'xl'] as const).map(size => ({ ...item, id: size, size }))}/>)
 for (const span of [3, 4, 6, 12]) expect(html).toContain(`--lg:${span}`)
 for (const size of ['XS', 'SM', 'MD', 'XL']) expect(html).toContain(size)
 expect(html.match(/Top 10 creators/g)?.length).toBe(4)
})
test('not owner state links back to the dashboard', () => {
 const html = render(<NotOwner dashboardKey="key"/>)
 expect(html).toContain('Only the owner can organize this dashboard.')
 expect(html).toContain('View dashboard')
 expect(html).toContain('href="/d/key"')
})
