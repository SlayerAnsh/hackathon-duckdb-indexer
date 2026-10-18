import { test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatusBarView, TopStateChip } from '../components/dash/StatusBar'
import type { Manifest } from '@asi/core'

const manifest: Manifest = { chainId: 60138453056, genesisHash: '0x0', expression: '', version: 7, snapshotBlock: 749000, headBlock: 749510, files: { entities: 'e', attributes: 'a' }, delta: 'd', live: 40000, pending: 15500 }

test('status bar shows state, en-US heights, fill progress and all entities', () => {
 const html = renderToStaticMarkup(<StatusBarView state={{ status: 'ready', manifest, liveHead: 749516, source: 'indexer' }} oldest={0}/>)
 expect(html).toContain('live')
 expect(html).toContain('from')
 expect(html).toContain('genesis')
 expect(html).toContain('749,510')
 expect(html).toContain('749,516')
 expect(html).toContain('6 blocks (12 s)')
 expect(html).toContain('attributes 15.5k pending')
 expect(html).toContain('v7')
 expect(html).toContain('all entities')
 expect(html).toContain('Index freshness')
})

test('status bar truncates long expressions, keeps the full one in the title, and labels disk mode', () => {
 const expression = 'type = "listing" && status = "active" && price > 100'
 const html = renderToStaticMarkup(<StatusBarView state={{ status: 'ready', manifest: { ...manifest, expression, pending: 0 }, liveHead: 749516, source: 'disk' }}/>)
 expect(html).toContain('served from disk')
 expect(html).not.toContain('pending</span>')
 expect(html).toContain('…')
 expect(html).toContain('title="' + expression.replace(/"/g, '&quot;').replace(/&&/g, '&amp;&amp;').replace(/>/g, '&gt;') + '"')
})

test('top bar chip carries only the state', () => {
 const html = renderToStaticMarkup(<TopStateChip state={{ status: 'ready', manifest, liveHead: 749516 }}/>)
 expect(html).toContain('live')
 expect(html).not.toContain('749')
})
