import { test, expect } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { RunBadge } from '../components/dash/RunBadge'
import { DataTable } from '../components/dash/DataTable'
import { QueryChart } from '../components/dash/AreaChart'
import { VIEWS } from '../lib/views'
test('measured timings are unbounded and tables handle empty data', () => {
 expect(renderToStaticMarkup(<RunBadge ms={123.45} rows={12}/>)).toContain('123.5 ms')
 expect(renderToStaticMarkup(<DataTable data={{columns:['key'],rows:[]}}/>)).toContain('No rows yet')
})
test('every chart handles zero rows and zero values', () => {
 for(const widget of VIEWS.flatMap(v=>v.widgets).filter(w=>!['table','stat'].includes(w.kind))) {
  expect(renderToStaticMarkup(<QueryChart widget={widget} data={{columns:[],rows:[]}}/>)).toContain('No rows yet')
  const html=renderToStaticMarkup(<QueryChart widget={widget} data={{columns:[widget.x!,String(widget.y)],rows:[['empty',0]]}}/>)
  expect(html).not.toContain('NaN'); expect(html).not.toContain('Infinity')
 }
})

test('widget errors stay local and previous data stays visible while refreshing', async () => {
 const { WidgetBody } = await import('../components/dash/WidgetCard')
 const widget={id:'test',title:'Test',sql:'SELECT 7',kind:'table' as const}
 const failed=renderToStaticMarkup(<WidgetBody widget={widget} query={{loading:false,error:'DuckDB: bad column'}}/>)
 expect(failed).toContain('DuckDB: bad column')
 const refreshing=renderToStaticMarkup(<WidgetBody widget={widget} query={{loading:true,data:{columns:['result'],rows:[[7]]},ms:2}}/>)
 expect(refreshing).toContain('result');expect(refreshing).toContain('7');expect(refreshing).not.toContain('Waiting')
})

test('hero shows fill progress only while the manifest has pending entities', async () => {
 const { Hero, FillProgress } = await import('../components/dash/Hero')
 const manifest = { chainId: 1, genesisHash: '0x', expression: '', version: 1, snapshotBlock: 1, headBlock: 1, files: { entities: 'e', attributes: 'a' }, delta: 'delta.json' }
 const html = renderToStaticMarkup(<FillProgress manifest={{ ...manifest, live: 30700, pending: 18200 }}/>)
 expect(html).toContain('Loading attributes: 18,200 of 30,700 entities pending, newest first')
 expect(renderToStaticMarkup(<FillProgress manifest={{ ...manifest, live: 30700, pending: 0 }}/>)).toBe('')
 expect(renderToStaticMarkup(<FillProgress manifest={manifest}/>)).toBe('')
 expect(typeof Hero).toBe('function')
})
