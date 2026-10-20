import { test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import AboutPage from '../app/about/page'
import { Story, Closing } from '../components/landing/Story'
import { Footer } from '../components/dash/Footer'

const html = renderToStaticMarkup(<AboutPage/>)
const text = html.replace(/<[^>]+>/g, ' ')

test('about page renders every section with a table of contents and both infographics', () => {
 for (const h of ['Why SQL over Arkiv', 'Architecture', 'Run your own indexer', 'Entity model', 'Who owns what', 'Expiry and lifetimes', 'Verify a row', 'Reproduce it', 'Limits and trust', 'Friction we measured', 'Who this protects', 'Why Arkiv', 'What stays off Arkiv on purpose', 'On chain evidence']) expect(text).toContain(h)
 const toc = [...html.matchAll(/href="#([\w-]+)"/g)].map(m => m[1])
 expect(toc.length).toBeGreaterThanOrEqual(9)
 for (const id of toc) expect(html).toContain(`id="${id}"`)
 expect(html).toContain('aria-label="Architecture from the Arkiv RPC to DuckDB in the browser"')
 expect(html).toContain('aria-label="Widget lifecycle"')
 expect(html).toContain('href="/explore"'); expect(html).toContain('href="/playground"')
})

test('about copy uses no dash punctuation and no unverified live tail API', () => {
 expect(text).not.toMatch(/[—–]| - /)
 expect(html).not.toContain('watchEntityEvents')
})

test('about covers the entity model, ownership, lifetimes and the read proxy', () => {
 for (const label of ['widget', 'dashboard', 'link', '1, 7, 30 or 90 days', 'Extend', 'Transferred to you', '/api/rpc', '/data', 'INDEX_EXPRESSION', 'eth_getProof']) expect(text).toContain(label)
 for (const status of ['ok', 'stale', 'extended', 'expired', 'deleted']) expect(html).toContain(`>${status}</span>`)
 expect(text.toLowerCase()).not.toMatch(/heartbeat|ticket|demo writer/)
})

test('every /about link on the home page lands on a section id', () => {
 const story = renderToStaticMarkup(<><Story/><Closing/></>)
 expect(story).not.toContain('href="#"')
 const anchors = [...story.matchAll(/href="\/about#([\w-]+)"/g)].map(m => m[1])
 expect(anchors.length).toBeGreaterThanOrEqual(2)
 for (const id of anchors) expect(html).toContain(`id="${id}"`)
})

test('footer links to the about page', () => {
 expect(renderToStaticMarkup(<Footer/>)).toContain('href="/about"')
})

test('about names the harmed users, the alternatives and the real app wallet with explorer links', () => {
 for (const label of ['Open Source', 'Security', 'Postgres run by an operator', 'IPFS', 'A subgraph', 'Our own API', 'pre-existing work: none', '20 October 2026']) expect(text).toContain(label)
 expect(html).toContain('/address/0x1f61c3cac1612c020f64739b128c5f198939c8cd')
 expect(html).toContain('/tx/0xa3668515f09911d190336e92457afba8759f79f3f18870e7d5a33f7cd7a21f03')
 expect(html.toLowerCase()).not.toContain('0xb0b87eddb0bc777eb663c7a11703ba5ed4849a28')
})
