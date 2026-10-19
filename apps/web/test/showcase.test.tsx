import { test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { VIEWS } from '../lib/views'
test('stat card renders label, value, context note and meter from the measured row', async () => {
 const { StatBody } = await import('../components/dash/WidgetCard')
 const widget = VIEWS[0].widgets.find(x => x.id === 'known')!
 const html = renderToStaticMarkup(<StatBody widget={widget} data={{ columns: ['value', 'total'], rows: [[11, 30]] }}/>)
 expect(html).toContain('>11<')
 expect(html).toContain('36.7% of live entities')
 expect(html).toContain('role="meter"')
 expect(html).toContain('aria-valuenow="36.7"')
 const empty = renderToStaticMarkup(<StatBody widget={widget} data={{ columns: ['value', 'total'], rows: [[0, 0]] }}/>)
 expect(empty).not.toContain('NaN')
 expect(empty).not.toContain('role="meter"')
})


test('showcase redirects and no application links retain the route', async () => {
 const { readFileSync, readdirSync } = await import('node:fs')
 const { join } = await import('node:path')
 const root = new URL('../',import.meta.url).pathname
 expect(readFileSync(join(root,'app/showcase/page.tsx'),'utf8')).toContain("redirect('/explore')")
 function scan(dir: string) { for (const entry of readdirSync(dir,{withFileTypes:true})) { const path=join(dir,entry.name); if(entry.isDirectory()) scan(path); else if (/\.(tsx?|css)$/.test(path)) expect(readFileSync(path,'utf8')).not.toMatch(/["'`]\/showcase/ ) } }
 for (const dir of ['app','components','lib']) scan(join(root,dir))
 for (const name of ['README.md','SPECS.md','DEVELOPER.md']) { const text=readFileSync(new URL('../../../'+name,import.meta.url),'utf8'); expect(text).not.toContain('/showcase'); expect(text).toContain('/explore'); expect(text).toContain('Official dashboards') }
})

test('shared chart bodies retain fixed SQL windows without range controls', async () => {
 const { readFileSync } = await import('node:fs')
 for (const file of ['WidgetCard.tsx', 'AreaChart.tsx']) {
  const source = readFileSync(new URL('../components/dash/' + file, import.meta.url), 'utf8')
  for (const name of ['TIME_RANGES', 'resolveWidget', 'bucketTimeLabel']) expect(source).not.toContain(name)
 }
})
