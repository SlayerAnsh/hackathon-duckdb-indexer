'use client'
import { useState } from 'react'
import type { IndexDb } from '../../lib/indexdb'
import { classifyVerify, verifyRows } from '../../lib/verify'
import { createBrowserRpc } from '../../lib/rpc-browser'
import { cellText,toCsv } from '../../lib/csv'
import { shortHex } from '../../lib/format'
import { rpcMessage } from '../RowActions'
import { RowActions } from './RowActions'
import { RunBadge } from './RunBadge'
export type QueryResult=Awaited<ReturnType<IndexDb['run']>>
export function ResultsGrid({result,db,sql,rpcUrl,ms,head}:{result:QueryResult;db:IndexDb;sql:string;rpcUrl:string;ms:number;head?:number}) {
 const [checks,setChecks]=useState<Record<string,{status:string;detail:string}>>({})
 const [busy,setBusy]=useState(false);const [error,setError]=useState('')
 const keyIndex=result.columns.indexOf('key')
 async function verify(indices:number[]) {
  setBusy(true)
  try {
   const chain=await verifyRows(rpcUrl,indices.map(i=>String(result.rows[i][keyIndex])));const block=await createBrowserRpc(rpcUrl).blockNumber()
   const next:typeof checks={}
   for(const i of indices){const row=result.rows[i],key=String(row[keyIndex]);const current=chain.get(key.toLowerCase())??null;const updated=result.columns.indexOf('updated_at'),expiry=result.columns.indexOf('expires_at');const status=current&&(updated<0||expiry<0)?'present':classifyVerify({updated_at:Number(row[updated]),expires_at:Number(row[expiry])},current,block);next[key]={status,detail:`Checked against ${rpcUrl} at block ${block}. `+(current?`Chain updated_at ${current.updatedAt}, expires_at ${current.expiresAt}, owner ${current.owner}.`:'Entity not found.')+(status==='present'?' Select updated_at and expires_at to compare.':'')}}
   setChecks(prev=>({...prev,...next}))
  } catch(e){setChecks(prev=>({...prev,...Object.fromEntries(indices.map(i=>[String(result.rows[i][keyIndex]),{status:'error',detail:rpcMessage(e)}]))}))}finally{setBusy(false)}
 }
 async function download(){setBusy(true);setError('');try{const full=await db.run(sql,Infinity);const url=URL.createObjectURL(new Blob([toCsv(full.columns,full.rows)],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='arkiv-results.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(String(e))}finally{setBusy(false)}}
 return <><div className="result-meta"><RunBadge ms={ms} rows={result.rows.length}/><span className="where">DuckDB WASM in your browser{head!==undefined?`, at block ${head.toLocaleString()}`:''}</span><span className="sp"/>{keyIndex>=0&&<button className="btn btn-quiet" disabled={busy||!result.rows.length} onClick={()=>void verify(result.rows.map((_,i)=>i))}>Verify page</button>}<button className="btn btn-quiet" disabled={busy} onClick={()=>void download()}>↓ CSV</button></div>{error&&<p className="error">{error}</p>}{!result.rows.length?<p className="empty">No rows yet</p>:<div className="tbl-wrap results"><table className="tbl"><thead><tr>{result.columns.map((c,i)=><th key={i}>{c}</th>)}{keyIndex>=0&&<th>Row</th>}</tr></thead><tbody>{result.rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} title={cellText(v)} className={typeof v==='number'||typeof v==='bigint'?'num':'mono'}>{shortHex(cellText(v))}</td>)}{keyIndex>=0&&<td><RowActions entityKey={String(r[keyIndex])} rpcUrl={rpcUrl} busy={busy} onVerify={()=>void verify([i])} {...checks[String(r[keyIndex])]}/></td>}</tr>)}</tbody></table></div>}<div className="res-foot">{result.truncated?'Showing the first 1,000 rows. CSV exports the full result. ':`${result.rows.length} rows. `}{keyIndex>=0&&'Verify re-reads rows from Tiramisu; this is a consistency check, not a cryptographic proof.'}</div></>
}
