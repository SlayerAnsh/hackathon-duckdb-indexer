import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { readFileSync, readdirSync } from 'node:fs'
import { nativeDb } from './dash-duckdb'
import { DASH_PROJECT } from '../lib/dash/schema'
import { dashboardListSql, dashboardCountSql, toDashboardItems, type DashboardListQuery } from '../lib/dash/sql'
import { tabFromSearch, searchForTab, tabAfterKey } from '../lib/dash/explore-tabs'
import { initDashboardBrowse, dashboardBrowseReducer, dashboardBrowseQuery, resultsLine } from '../lib/dash/dashboard-browse-state'
import { DashboardBrowseCard } from '../components/explore/DashboardBrowseCard'
import { DashboardBrowseView } from '../components/explore/DashboardBrowse'
import { ExplorePageView } from '../components/explore/ExplorePage'
const W = '0x' + 'ab'.repeat(20), U = '0x' + 'cd'.repeat(20)
const key = (n: number) => '0x' + n.toString(16).padStart(64, '0')
const q: DashboardListQuery = { search: '', sort: 'newest', official: false, limit: 12, offset: 0 }
test('dashboard SQL scopes, searches, sorts, counts and aggregates charts', async () => {
 const base = { project: DASH_PROJECT, user: U }
 const rows = [1,2,3,4].map(n => ({ key: key(n), creator: W, created_at: n, expires_at: 100-n, attrs: { ...base, user: n === 1 ? W : U, type: 'dashboard', title: ['Overview','100% live','Other','Last'][n-1] } }))
 const { db, close } = await nativeDb([...rows, { ...rows[0], key: key(5), creator: U }, ...[6,7,8].map((n,i) => ({key:key(n),creator:W,attrs:{...base,type:'widget',chart:i===2?'donut':'bar'}})), ...[9,10,11].map((n,i)=>({key:key(n),creator:W,attrs:{...base,type:'link',dashboard:key(1),widget:key(i+6)}}))])
 const query = async (patch: Partial<DashboardListQuery> = {}) => (await db.runAndReadAll(dashboardListSql(W,{...q,...patch}))).getRowObjects()
 try {
  expect((await query()).map(r=>r.key)).toEqual([4,3,2,1].map(key))
  expect((await query({sort:'oldest'})).map(r=>r.key)).toEqual([1,2,3,4].map(key))
  expect((await query({sort:'widgets'}))[0].key).toBe(key(1))
  expect((await query({sort:'expiring'})).map(r=>r.key)).toEqual([4,3,2,1].map(key))
  expect(await query({official:true})).toHaveLength(1)
  expect((await query({search:'over'}))[0].title).toBe('Overview')
  expect((await query({search:'%'})).map(r=>r.key)).toEqual([key(2)])
  expect(await query({search:"x' OR '1'='1"})).toHaveLength(0)
  expect((await query({limit:1,offset:1}))[0].key).toBe(key(3))
  const chartRows = (await db.runAndReadAll(dashboardListSql(W,{...q,official:true}))).getRowsJson()
  expect(toDashboardItems(chartRows)[0].charts).toEqual(['bar','donut'])
  expect(Number((await db.runAndReadAll(dashboardCountSql(W,q))).getRowObjects()[0].n)).toBe(4)
  expect(()=>dashboardListSql(W,{...q,limit:-1})).toThrow()
 } finally { close() }
 expect(toDashboardItems([['0xAB','Title',U,true,BigInt(8),['bar'],BigInt(1),BigInt(2),BigInt(3)]])[0]).toMatchObject({key:'0xab',widgets:8,official:true,createdAt:1})
})
test('tabs preserve URL parameters and support keyboard movement',()=>{
 expect(tabFromSearch('?tab=widgets')).toBe('widgets')
 for(const search of ['', '?tab=x']) expect(tabFromSearch(search)).toBe('dashboards')
 expect(searchForTab('?q=a','widgets')).toBe('?q=a&tab=widgets')
 expect(searchForTab('?tab=widgets','dashboards')).toBe('')
 expect(tabAfterKey('dashboards','ArrowRight')).toBe('widgets')
 expect(tabAfterKey('widgets','ArrowLeft')).toBe('dashboards')
 expect(tabAfterKey('widgets','Home')).toBe('dashboards')
 expect(tabAfterKey('dashboards','End')).toBe('widgets')
})
test('dashboard filters reset pages and label results',()=>{
 const s=initDashboardBrowse(), more=dashboardBrowseReducer(s,{type:'more'})
 expect(more.pages).toBe(2)
 for(const action of [{type:'search',value:'x'},{type:'sort',value:'widgets'},{type:'official',value:true}] as const) expect(dashboardBrowseReducer(more,action).pages).toBe(1)
 expect(dashboardBrowseReducer(more,{type:'clear'})).toEqual(s)
 expect(dashboardBrowseQuery(more).limit).toBe(24)
 expect(resultsLine(38,s)).toBe('38 dashboards, newest first')
 expect(resultsLine(1,{...s,sort:'widgets'})).toBe('1 dashboard, most widgets first')
 expect(resultsLine(5,{...s,sort:'expiring',official:true})).toBe('5 official dashboards, expiring soonest first')
})
const item = {key:key(1),title:'Overview',user:W,official:true,widgets:8,charts:['bar','donut'] as ('bar'|'donut')[],createdAt:1,updatedAt:2,expiresAt:100}
test('dashboard card authors, lifetime, chart icons and empty thumbnails',()=>{
 const html=render(<DashboardBrowseCard item={item} description="Network report"/>)
 for(const text of ['Official','Arkiv SQL Indexer','Kept live','8 widgets','Network report',`href="/d/${key(1)}"`]) expect(html).toContain(text)
 expect((html.match(/<svg/g)??[]).length).toBeGreaterThanOrEqual(2)
 const user=render(<DashboardBrowseCard item={{...item,official:false,user:U,widgets:1,charts:[]}} head={10}/>)
 expect(user).not.toContain('Official')
 expect(user).toContain('1 widget')
 expect(user).toContain('No widgets yet')
 expect(user).toContain('Expires in')
})
test('Explore exposes accessible tabs and dashboard empty states',()=>{
 const html=render(<ExplorePageView tab="widgets" onTab={()=>{}}/>)
 for(const text of ['<h1>Explore</h1>','role="tablist"','aria-label="Explore"','aria-selected="true" tabindex="0"','aria-selected="false" tabindex="-1"']) expect(html).toContain(text)
 const props={state:initDashboardBrowse(),dispatch:()=>{},items:[],loading:false,total:0}
 expect(render(<DashboardBrowseView {...props}/>)).toContain('No dashboards yet. Build the first one.')
 expect(render(<DashboardBrowseView {...props} state={{...props.state,search:'x'}}/>)).toContain('No dashboards match these filters.')
 expect(readFileSync(new URL('../app/widgets/page.tsx',import.meta.url),'utf8')).toContain("redirect('/explore?tab=widgets')")
})

test('component and page links use the Explore widgets tab', () => {
 const walk = (dir: string): string[] => readdirSync(dir, {withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(dir+'/'+entry.name) : [dir+'/'+entry.name])
 for(const root of ['../components','../app'].map(p=>new URL(p,import.meta.url).pathname)) for(const file of walk(root).filter(file=>file.endsWith('.tsx'))) expect(readFileSync(file,'utf8')).not.toMatch(/href=["']\/widgets["']/)
})
