import { test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import AboutPage from '../app/about/page'
import { EXPIRY_SECONDS } from '../../demo-writer/src/plan'

const html = renderToStaticMarkup(<AboutPage/>)
const text = html.replace(/<[^>]+>/g, ' ')

test('about page renders every section and both infographics', () => {
 for (const h of ['Who this protects', 'How it works', 'Why Arkiv', 'How we use Arkiv', 'Expiry, end to end', 'Friction we measured', 'Reproduce it']) expect(text).toContain(h)
 expect(html.match(/role="img"/g)).toHaveLength(2)
 expect(html).toContain('<title id="arch-t">'); expect(html).toContain('<title id="exp-t">')
 expect(html).toContain('href="/showcase"'); expect(html).toContain('href="/playground"')
})

test('about copy uses no dash punctuation and no unverified live tail API', () => {
 expect(text).not.toMatch(/[—–]| - /)
 expect(html).not.toContain('watchEntityEvents')
})

test('expiry infographic matches the demo writer lifetimes', () => {
 expect(EXPIRY_SECONDS).toEqual({ ticket: 604800, comment: 86400, heartbeat: 600 })
 for (const label of ['10 min', '1 day', '7 days']) expect(text).toContain(label)
})
