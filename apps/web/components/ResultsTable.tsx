'use client'
import { useState } from 'react'
import type { IndexDb } from '../lib/indexdb'
import { classifyVerify, verifyRows } from '../lib/verify'
import { cellText, toCsv } from '../lib/csv'
import { createBrowserRpc } from '../lib/rpc-browser'
import { RowActions, rpcMessage } from './RowActions'
export type QueryResult = Awaited<ReturnType<IndexDb['run']>>
export function ResultsTable({ result, db, sql, rpcUrl }: { result: QueryResult; db: IndexDb; sql: string; rpcUrl: string }) {
 const [checks, setChecks] = useState<Record<string,string>>({}); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
 const keyIndex = result.columns.indexOf('key')
 async function verify(indices: number[]) {
 setBusy(true)
 try {
 const keys = indices.map(i => String(result.rows[i][keyIndex])); const chain = await verifyRows(rpcUrl, keys); const head = await createBrowserRpc(rpcUrl).blockNumber()
 const next: Record<string,string> = {}
 for (const i of indices) {
 const row = result.rows[i]; const key = String(row[keyIndex]); const current = chain.get(key.toLowerCase()) ?? null
 const updated = result.columns.indexOf('updated_at'), expires = result.columns.indexOf('expires_at')
 next[key] = current && (updated < 0 || expires < 0) ? 'Present on chain; select updated_at and expires_at to compare' : classifyVerify({ updated_at: Number(row[updated]), expires_at: Number(row[expires]) }, current, head)
 if (current && next[key] !== 'ok') next[key] += ` · chain updated_at ${current.updatedAt}, expires_at ${current.expiresAt}, owner ${current.owner}`
 }
 setChecks(prev => ({ ...prev, ...next }))
 } catch (e) { setChecks(prev => ({ ...prev, ...Object.fromEntries(indices.map(i => [String(result.rows[i][keyIndex]), rpcMessage(e)])) })) } finally { setBusy(false) }
 }
 async function download() {
 setBusy(true); setError('')
 try { const full = await db.run(sql, Infinity); const url = URL.createObjectURL(new Blob([toCsv(full.columns,full.rows)], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'arkiv-results.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } catch(e) { setError(String(e)) } finally { setBusy(false) }
 }
 return <section><h2>Results</h2><p>{result.rows.length} rows{result.truncated || result.rows.length >= 1000 ? ' · showing first 1000 rows' : ''}</p><button disabled={busy} onClick={() => void download()}>Download full CSV</button>{keyIndex >= 0 && <><button disabled={busy} onClick={() => void verify(result.rows.map((_,i) => i))}>Verify page</button><p>checked against {rpcUrl}, not a cryptographic proof</p></>}{error && <p role="alert">{error}</p>}<div className="table-scroll"><table><thead><tr>{result.columns.map((c,i) => <th key={i}>{c}</th>)}{keyIndex >= 0 && <th>Row actions</th>}</tr></thead><tbody>{result.rows.map((r,i) => <tr key={i}>{r.map((v,j) => <td key={j}>{cellText(v)}</td>)}{keyIndex >= 0 && <td><RowActions entityKey={String(r[keyIndex])} rpcUrl={rpcUrl}/><button disabled={busy} onClick={() => void verify([i])}>Verify</button><span className="chip">{checks[String(r[keyIndex])]}</span></td>}</tr>)}</tbody></table></div></section>
}
