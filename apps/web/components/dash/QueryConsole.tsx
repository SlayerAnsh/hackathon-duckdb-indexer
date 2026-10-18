'use client'
import { useEffect,useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { VIEWS, DEFAULT_SQL } from '../../lib/views'
import { useDocumentTheme,useSqlEditor } from '../playground/useSqlEditor'
import { readHash,writeHash } from '../../lib/hash-state'
import type { IndexDb } from '../../lib/indexdb'
import { ResultsGrid,type QueryResult } from './ResultsGrid'
import { QueryHistory,type HistoryEntry } from './QueryHistory'
export function QueryConsole({db,value,onChange,rpcUrl,head}:{db:IndexDb|null;value:string;onChange:(s:string)=>void;rpcUrl:string;head?:number}) {
 const [running,setRunning]=useState(false);const [error,setError]=useState('');const [history,setHistory]=useState<HistoryEntry[]>([])
 const [result,setResult]=useState<{data:QueryResult;sql:string;ms:number;head?:number;id:number}>()
 useEffect(()=>{const restore=()=>{const saved=readHash();if(saved)onChange(saved)};restore();window.addEventListener('hashchange',restore);return()=>window.removeEventListener('hashchange',restore)},[onChange])
 const {extensions}=useSqlEditor(db,()=>void run());const theme=useDocumentTheme()
 async function run(){if(!db||running)return;setRunning(true);setError('');writeHash(value);try{const data=await db.run(value);const ms=data.elapsedMs;setResult(prev=>({data,sql:value,ms,head,id:(prev?.id??0)+1}));setHistory(prev=>[{sql:value,ms,rows:data.rows.length},...prev].slice(0,20))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setRunning(false)}}
 return <section className="sec" id="console" aria-labelledby="console-h"><div className="sec-h"><h2 id="console-h">SQL console</h2><p>Full SQL over the live index. Everything runs locally in this tab.</p></div><div className="console"><div className="con-bar"><select aria-label="Example queries" value="" onChange={e=>onChange(e.target.value)}><option value="" disabled>Choose an example query</option><option value={DEFAULT_SQL}>Open tickets with the most discussion</option>{VIEWS.flatMap(v=>v.widgets).map(w=><option key={w.id} value={w.sql}>{w.title}</option>)}</select><span className="sp"/><span className="con-hint">Ctrl / Cmd + Enter</span><button className="btn" disabled={!db||!running} onClick={()=>void db?.cancel().catch(e=>setError(String(e)))}>Cancel</button><button className="btn btn-primary" disabled={!db||running} onClick={()=>void run()}>{running?'Running…':'▶ Run query'}</button></div><div className="con-body"><div className="editor" style={{display:'block'}}><CodeMirror aria-label="SQL query" value={value} height="340px" theme={theme} extensions={extensions} onChange={onChange}/></div><QueryHistory entries={history} onSelect={onChange}/></div>{error&&<p className="error" role="status">{error}</p>}{db&&result?<ResultsGrid key={result.id} result={result.data} db={db} sql={result.sql} rpcUrl={rpcUrl} ms={result.ms} head={result.head}/>:<p className="empty">{db?'Run a query to see results.':'Waiting for index…'}</p>}</div></section>
}
