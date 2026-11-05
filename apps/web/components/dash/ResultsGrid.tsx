'use client'
import { useState } from 'react'
import type { IndexDb } from '../../lib/indexdb'
import { classifyVerify, verifyRows } from '../../lib/verify'
import { createBrowserRpc } from '../../lib/rpc-browser'
import { cellText,toCsv } from '../../lib/csv'
import { numericColumns } from '../../lib/table'
import { CellValue } from './CellValue'
import { rpcMessage } from '../RowActions'
import { RowActions } from './RowActions'
import { RunBadge } from './RunBadge'
import d from './data.module.css'
import { cx } from './cx'
export type QueryResult=Awaited<ReturnType<IndexDb['run']>>
export function ResultsGrid({result,db,sql,rpcUrl,ms,head}:{result:QueryResult;db:IndexDb;sql:string;rpcUrl:string;ms:number;head?:number}) {
 const [checks,setChecks]=useState<Record<string,{status:string;detail:string}>>({})
 const [busy,setBusy]=useState(false);const [error,setError]=useState('')
 const keyIndex=result.columns.indexOf('key')
 const num=numericColumns(result.columns,result.rows)
 async function verify(indices:number[]) {
  setBusy(true)
  try {
   const chain=await verifyRows(rpcUrl,indices.map(i=>String(result.rows[i][keyIndex])));const block=await createBrowserRpc(rpcUrl).blockNumber()
   const next:typeof checks={}
   for(const i of indices){const row=result.rows[i],key=String(row[keyIndex]);const current=chain.get(key.toLowerCase())??null;const updated=result.columns.indexOf('updated_at'),expiry=result.columns.indexOf('expires_at');const status=current&&(updated<0||expiry<0)?'present':classifyVerify({updated_at:Number(row[updated]),expires_at:Number(row[expiry])},current,block);next[key]={status,detail:`Checked against the Arkiv RPC at block ${block}. `+(current?`Chain updated_at ${current.updatedAt}, expires_at ${current.expiresAt}, owner ${current.owner}.`:'Entity not found.')+(status==='present'?' Select updated_at and expires_at to compare.':'')}}
   setChecks(prev=>({...prev,...next}))
  } catch(e){setChecks(prev=>({...prev,...Object.fromEntries(indices.map(i=>[String(result.rows[i][keyIndex]),{status:'error',detail:rpcMessage(e)}]))}))}finally{setBusy(false)}
 }
 async function download(){setBusy(true);setError('');try{const full=await db.run(sql,Infinity);const url=URL.createObjectURL(new Blob([toCsv(full.columns,full.rows)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='arkiv-results.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(String(e))}finally{setBusy(false)}}
 const shield=<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 1.75 2.75 3.5v4c0 3.2 2.2 5.5 5.25 6.75 3.05-1.25 5.25-3.55 5.25-6.75v-4Z"/><path d="m5.75 8 1.6 1.6 2.9-3.1"/></svg>
 const down=<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2.5v8M4.75 7.5 8 10.75l3.25-3.25M3 13.5h10"/></svg>
 return <><div className={d.meta}><RunBadge ms={ms} rows={result.rows.length}/><span className={d.where}>DuckDB WASM in your browser{head!==undefined&&<>, block <b>{head.toLocaleString('en-US')}</b></>}</span><span className={d.spacer}/><span className={d.tools}>{keyIndex>=0&&<button type="button" className="btn btn-quiet btn-sm" disabled={busy||!result.rows.length} onClick={()=>void verify(result.rows.map((_,i)=>i))}>{shield}Verify page</button>}<button type="button" className="btn btn-quiet btn-sm" disabled={busy} aria-busy={busy||undefined} onClick={()=>void download()}>{down}CSV</button></span></div>
  {error&&<p className={cx('error', d.error, d.metaError)} role="alert">{error}</p>}
  {!result.rows.length?<p className={cx('empty', d.empty)}>No rows yet. The query ran and returned an empty result.</p>:<div className={cx('tbl-wrap', 'results', d.wrap, d.grid)}><table className={cx('tbl', d.table)}><thead><tr><th className={d.idx} aria-label="Row number">#</th>{result.columns.map((c,i)=><th key={i} className={num[i]?'num':undefined}>{c}</th>)}{keyIndex>=0&&<th className={d.actionsCol}>Actions</th>}</tr></thead><tbody>{result.rows.map((r,i)=><tr key={i}><td className={d.idx}>{i+1}</td>{r.map((v,j)=><td key={j} title={cellText(v)} className={num[j]?'num':'mono'}><CellValue column={result.columns[j]} value={v}/></td>)}{keyIndex>=0&&<td className={d.actionsCol}><RowActions entityKey={String(r[keyIndex])} rpcUrl={rpcUrl} busy={busy} onVerify={()=>void verify([i])} {...checks[String(r[keyIndex])]}/></td>}</tr>)}</tbody></table></div>}
  {(result.truncated||keyIndex>=0)&&<div className={d.foot}>{result.truncated&&<span>Showing the first <b>1,000</b> rows. CSV exports the full result.</span>}{keyIndex>=0&&<span>Verify re-reads rows from Rabdi. It is a consistency check, not a cryptographic proof.</span>}</div>}</>
}
