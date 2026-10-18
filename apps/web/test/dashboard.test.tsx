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

const ADDR = '0x6cb4a1b2c3d4e5f60718293a4b5c6d7e8f905e22'
const KEY = '0x' + 'ab'.repeat(32)

test('stat cards link the subject address to the explorer and keep the context line', async () => {
 const { StatBody } = await import('../components/dash/WidgetCard')
 const { EXPLORER_URL } = await import('../lib/explorer')
 const widget = { id: 's', title: 'S', sql: 'SELECT 1', kind: 'stat' as const, note: { kind: 'share' as const, text: '{n} of live entities' } }
 const html = renderToStaticMarkup(<StatBody widget={widget} data={{ columns: ['value', 'total', 'address'], rows: [[7309, 31235, ADDR]] }}/>)
 expect(html).toContain(`href="${EXPLORER_URL}/address/${ADDR}"`)
 expect(html).toContain('0x6cb4…5e22'); expect(html).toContain(`title="${ADDR}"`)
 expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noreferrer"')
 expect(html).toContain('by '); expect(html).toContain('23.4% of live entities')
 expect(renderToStaticMarkup(<StatBody widget={widget} data={{ columns: ['value', 'total'], rows: [[1, 2]] }}/>)).not.toContain('href')
})

test('tables link addresses, leave keys alone and align numeric columns', () => {
 const html = renderToStaticMarkup(<DataTable data={{ columns: ['key', 'creator', 'name', 'avg', 'updated_at'], rows: [[KEY, ADDR, 'creator0', 554.8426966292135, 1234567], [KEY, 'creator0', 'x', null, 7]] }}/>)
 expect(html.match(/href=/g)?.length).toBe(1)
 expect(html).toContain(`/address/${ADDR}"`)
 expect(html).toContain('0xabab…abab'); expect(html).not.toContain(`/address/${KEY}`)
 expect(html).toContain('<th class="num">avg</th>'); expect(html).toContain('<th>name</th>')
 expect(html).toContain('554.84'); expect(html).toContain('title="554.8426966292135"'); expect(html).toContain('>1234567<')
})
