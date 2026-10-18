'use client'
import { useEffect, useState } from 'react'
import { useIndex } from '../lib/use-index'
import { readHash, writeHash } from '../lib/hash-state'
import { StatusBar } from '../components/StatusBar'
import { Dashboard } from '../components/Dashboard'
import { SqlEditor } from '../components/SqlEditor'
import { ResultsTable, type QueryResult } from '../components/ResultsTable'
import { ChangesFeed } from '../components/ChangesFeed'
export default function Page() {
 const { db,state } = useIndex(); const [sql,setSql] = useState('SELECT * FROM entities'); const [result,setResult] = useState<QueryResult | null>(null); const [resultSql,setResultSql] = useState(''); const [revision,setRevision] = useState(0); const [running,setRunning] = useState(false); const [error,setError] = useState('')
 const [rpcUrl,setRpcUrl] = useState(process.env.NEXT_PUBLIC_TIRAMISU_RPC_URL ?? 'https://rpc.tiramisu.db-chain.testnet.arkiv.network')
 useEffect(() => { const restore = () => { const saved = readHash(); if (saved) setSql(saved) }; restore(); window.addEventListener('hashchange',restore); return () => window.removeEventListener('hashchange',restore) }, [])
 async function run() { if (!db || running) return; setRunning(true); setError(''); writeHash(sql); try { const next = await db.run(sql); setResult(next); setRevision(n => n + 1); setResultSql(sql) } catch(e) { setError(e instanceof Error ? e.message : String(e)) } finally { setRunning(false) } }
 return <main><StatusBar state={state}/><label>Verification and changes RPC URL <input type="url" value={rpcUrl} onChange={e => setRpcUrl(e.target.value)}/></label>{db && <><Dashboard db={db} block={state.deltaTo} onSql={s => { setSql(s); document.getElementById('sql-editor')?.scrollIntoView({ behavior: 'smooth' }) }}/><SqlEditor db={db} value={sql} onChange={setSql} onRun={() => void run()} running={running} error={error}/>{result && <ResultsTable key={revision + ':' + rpcUrl} result={result} db={db} sql={resultSql} rpcUrl={rpcUrl}/>}<ChangesFeed db={db} rpcUrl={rpcUrl}/></>}</main>
}
