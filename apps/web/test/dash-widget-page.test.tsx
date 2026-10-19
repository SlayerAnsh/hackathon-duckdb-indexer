import { expect, test } from 'bun:test'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { widgetLoadState, WidgetPageBody, widgetPageMode, ViewerHeader, MissingWidget, StoredWidgetPreview } from '../components/widgets/WidgetPage'
import { pickerRows, PickerList } from '../components/widgets/AddToDashboardPicker'
import { emptyWidget } from '../lib/dash/schema'
import type { WidgetEntity } from '../lib/dash/entities'
import type { PendingWrite } from '../lib/dash/pending'
import { playgroundHref } from '../components/dash/WidgetCard'
import { checkWidgetSql } from '../lib/dash/sql-guard'
const K = '0x' + 'ab'.repeat(32), D = '0x' + 'cd'.repeat(32), U = '0x' + 'ef'.repeat(20)
const widget = { user: U, owner: U, widget: { ...emptyWidget(), name: 'Count', sql: 'SELECT count(*) FROM entities' } } as WidgetEntity

test('widget page mode handles loading, missing, owner and public viewers', () => {
 expect(widgetPageMode({ loaded: false, widget: null })).toBe('loading')
 expect(widgetPageMode({ loaded: true, widget: null })).toBe('missing')
 expect(widgetPageMode({ loaded: true, widget, address: U.toUpperCase() })).toBe('owner')
 expect(widgetPageMode({ loaded: true, widget })).toBe('viewer')
 expect(widgetPageMode({ loaded: true, widget, address: 'other' })).toBe('viewer')
})
test('picker merges pending dashboards and links without duplicating SQL rows', () => {
 const pending: PendingWrite[] = [
  { key: D, kind: 'dashboard', op: 'upsert', afterBlock: 1, at: 1, fields: { title: 'New' } },
  { key: 'link', kind: 'link', op: 'upsert', afterBlock: 1, at: 1, fields: { dashboard: D, widget: K } },
 ]
 expect(pickerRows([[K, 'Existing', BigInt(4), true, 1]], pending, K)).toEqual([
  { key: K, title: 'Existing', widgets: 4, added: true }, { key: D, title: 'New', widgets: 0, added: true },
 ])
 expect(pickerRows([[D, 'Indexed', 1, false, 2]], pending, K)).toHaveLength(1)
 expect(pickerRows([], [{ ...pending[1], fields: { dashboard: D, widget: 'other' } }, pending[0]], K)[0].added).toBe(false)
})
test('picker row states and new dashboard action', () => {
 const rows = ['already', 'adding', 'done'].map(key => ({ key, title: key, widgets: 4, added: key === 'already' }))
 const html = render(<PickerList rows={rows} phase={{ adding: 'adding', done: 'done' }} onPick={() => {}} onNew={() => {}}/>)
 for (const copy of ['Already added', 'Adding…', 'Added ✓', 'href="/d/done"', 'View', '+ New dashboard']) expect(html).toContain(copy)
})
test('viewer header links to the playground and missing copy links to browse', () => {
 const html = render(<ViewerHeader name="Count" sql={widget.widget.sql} onAdd={() => {}}/>)
 expect(html).toContain('+ Add to my dashboard')
 expect(html).toContain('Open in playground')
 expect(html).toContain(`href="${playgroundHref(widget.widget.sql)}"`)
 const missing = render(<MissingWidget/>)
 expect(missing).toContain('This widget has expired. Its query is no longer on Arkiv.')
 expect(missing).toContain('href="/explore?tab=widgets"')
 expect(missing).toContain('Browse widgets')
})
test('unsafe stored SQL never mounts the query runner', () => {
 let calls = 0
 const payload = { ...widget.widget, sql: 'DELETE FROM entities' }
 const html = render(<StoredWidgetPreview payload={payload} version={0} run={() => { calls++; return { loading: false } }}/>)
 expect(html).toContain('class="error"')
 expect(html).toContain(checkWidgetSql(payload.sql)!)
 expect(calls).toBe(0)
})

test('widget loading waits for auth and retries pending writes and transient errors', () => {
 const input = { authStatus: 'anonymous', widget: null, pending: false, attempts: 0, loadError: false }
 expect(widgetLoadState({ ...input, authStatus: 'loading', widget })).toBe('auth')
 expect(widgetLoadState({ ...input, widget, pending: true, loadError: true })).toBe('ready')
 expect(widgetLoadState({ ...input, pending: true, attempts: 9 })).toBe('syncing')
 expect(widgetLoadState({ ...input, pending: true, attempts: 10 })).toBe('missing')
 expect(widgetLoadState({ ...input, loadError: true, attempts: 2 })).toBe('syncing')
 expect(widgetLoadState({ ...input, loadError: true, attempts: 3 })).toBe('error')
 expect(widgetLoadState(input)).toBe('missing')
 expect(widgetPageMode({ loaded: true, widget, authStatus: 'loading' })).toBe('loading')
})
test('syncing widget page body shows the pending name without expired copy', () => {
 const html = render(<WidgetPageBody state="syncing" name="Count"/>)
 expect(html).toContain('Count')
 expect(html).toContain('Syncing')
 expect(html).toContain('state-disk')
 expect(html).not.toContain('expired')
})

test('widget detail header, used on and lifetime panels', async () => {
 const { WidgetHeader, UsedOnPanel, LifetimePanel } = await import('../components/widgets/WidgetPage')
 const props = {name:'Count',chart:'bar' as const,user:U,official:false,uses:12,expiresAt:999999,head:10,widgetKey:K,sql:'SELECT 1',canAdd:true}
 const html = render(<WidgetHeader {...props}/>)
 for (const text of ['href="/explore"','href="/explore?tab=widgets"','<h1','Bar','on 12 dashboards','Live, computed in your browser','Copy link','Open in playground','+ Add to dashboard','btn-primary']) expect(html).toContain(text)
 expect(html).toContain(`href="${playgroundHref(props.sql)}"`)
 const official = render(<WidgetHeader {...props} official/> )
 for (const text of ['Arkiv SQL Indexer','Kept live']) expect(official).toContain(text)
 const items = Array.from({length:6},(_,i)=>({key:String(i),title:`Report ${i}`,user:U,official:i===0,widgets:4}))
 const panel = render(<UsedOnPanel items={items} total={6}/> )
 for (const text of ['Used on 6 dashboards','Show all 6','Official']) expect(panel).toContain(text)
 expect((panel.match(/href="\/d\//g)??[]).length).toBe(4)
 expect((render(<UsedOnPanel items={items} total={6} expanded/>).match(/href="\/d\//g)??[]).length).toBe(6)
 const lifetime = {...props,lifetimeDays:7 as const,canExtend:true}
 const kept = render(<LifetimePanel {...lifetime} official/> )
 expect(kept).toContain('Kept live'); expect(kept).not.toContain('Extend')
 const user = render(<LifetimePanel {...lifetime}/> )
 for (const text of ['Extend by 7 days','Lives for 7 days per extend','You can extend']) expect(user).toContain(text)
})

test('used on SQL scopes live links and dashboards and orders official first', async () => {
 const { nativeDb } = await import('./dash-duckdb')
 const { widgetDashboardsSql, toUsedOn } = await import('../lib/dash/sql')
 const { DASH_PROJECT } = await import('../lib/dash/schema')
 const key = (n:number) => '0x'+n.toString(16).padStart(64,'0')
 const wallet = '0x'+'ab'.repeat(20)
 const base = {project:DASH_PROJECT,user:U}
 const rows = [1,2,3,4,5,6].map(n=>({key:key(n),creator:n===5?U:wallet,expires_at:n===4?5:100,attrs:{...base,user:n===1?wallet:U,type:'dashboard',title:`Report ${n}`}}))
 const links = [1,2,3,4,5,6].map(n=>({key:key(n+10),creator:wallet,expires_at:n===3?5:100,attrs:{...base,type:'link',widget:K,dashboard:key(n)}}))
 const {db,close} = await nativeDb([...rows,...links])
 try {
  await db.run('CREATE TABLE live_head AS SELECT 10 AS block')
  const result = (await db.runAndReadAll(widgetDashboardsSql(wallet,K,10))).getRowsJson()
  expect(result.map(r=>r[0])).toEqual([key(1),key(2),key(6)])
  expect((await db.runAndReadAll(widgetDashboardsSql(wallet,K,2))).getRowsJson()).toHaveLength(2)
 } finally {close()}
 expect(toUsedOn([['0xAB','Title',wallet.toUpperCase(),BigInt(4),wallet]],wallet)[0]).toEqual({key:'0xab',title:'Title',user:wallet,official:true,widgets:4})
 expect(()=>widgetDashboardsSql(wallet,K,-1)).toThrow()
})


test('stored widget preview offers chart and table plus focusable read only SQL', () => {
 const html = render(<StoredWidgetPreview payload={widget.widget} version={1} run={() => ({loading:false,ms:1,data:{columns:['n'],rows:[[1]]}})}/> )
 for (const text of ['aria-label="Preview view"','aria-pressed="true"','aria-pressed="false"','Chart','Table','Copy SQL','tabindex="0"','<pre']) expect(html).toContain(text)
})

test('organize rows show Kept live and hide Extend for official widgets', async () => {
 const { OrganizeRow } = await import('../components/widgets/OrganizeRow')
 const { DashAuthContext } = await import('../components/auth/DashAuthProvider')
 const wallet = '0x'+'ab'.repeat(20)
 const auth = {config:{enabled:true,wallet,privyAppId:'test',rpcUrl:'offline'},status:'authenticated' as const,address:U,confirming:false,error:null,sign:async()=>{throw Error('unused')},requestLogin:async()=>true,logout:async()=>{},refresh:async()=>{}}
 const item = {id:'row',link:D,widget:K,name:'Official count',chart:'counter' as const,size:'xs' as const,imported:true,expiresAt:999999,lifetimeDays:7 as const,expired:false,flash:false}
 const html = render(<DashAuthContext.Provider value={auth}><OrganizeRow item={item} index={0} count={1} head={10} importedUser={wallet} onResize={()=>{}} onRemove={()=>{}}/></DashAuthContext.Provider>)
 expect(html).toContain('Kept live')
 expect(html).toContain('Arkiv SQL Indexer')
 expect(html).not.toContain('Extend')
})

test('widget owner view follows current owner rather than author', () => {
 const moved = { ...widget, owner: '0x' + '12'.repeat(20) }
 expect(widgetPageMode({ loaded: true, widget: moved, address: U, authStatus: 'authenticated' })).toBe('viewer')
 expect(widgetPageMode({ loaded: true, widget: moved, address: moved.owner, authStatus: 'authenticated' })).toBe('owner')
})
