'use client'
import { useEffect, useState } from 'react'
import { ENTITY_EVENTS_ABI } from '@arkiv-network/sdk'
import { decodeEventLog, type Hex } from 'viem'
import type { IndexDb } from '../lib/indexdb'
import { createBrowserRpc } from '../lib/rpc-browser'
import { rpcMessage } from './RowActions'
export function ChangesFeed({ db, rpcUrl }: { db: IndexDb; rpcUrl: string }) {
 const [events,setEvents] = useState<{ id: string; key: string; type: string; block: number }[]>([]); const [error,setError] = useState('')
 useEffect(() => {
 let active = true; let timer: ReturnType<typeof setTimeout>
 async function poll() {
 try {
 const rpc = createBrowserRpc(rpcUrl); const head = await rpc.blockNumber(); const logs = await rpc.getLogs(Math.max(0,head-29),head)
 const decoded = logs.flatMap(log => { try { const event = decodeEventLog({ abi: ENTITY_EVENTS_ABI, topics: log.topics as [Hex,...Hex[]], data: log.data as Hex }); return [{ id: log.transactionHash + ':' + log.logIndex, key: event.args.entityKey.toLowerCase(), type: event.eventName, block: log.blockNumber }] } catch { return [] } })
 const keys = [...new Set(decoded.map(e => e.key))]
 const present = keys.length ? await db.run("SELECT key FROM entities WHERE key IN (" + keys.map(k => "'" + k.replaceAll("'","''") + "'").join(',') + ')', Infinity) : { rows: [] }
 const allowed = new Set(present.rows.map(r => String(r[0]).toLowerCase()))
 if (active) { setEvents(decoded.filter(e => allowed.has(e.key)).reverse().slice(0,20)); setError('') }
 } catch(e) { if (active) setError(rpcMessage(e)) }
 if (active) timer = setTimeout(poll,4000)
 }
 void poll(); return () => { active = false; clearTimeout(timer) }
 }, [db,rpcUrl])
 return <section><h2>Recent changes</h2>{error && <p role="alert">{error}</p>}{!events.length && <p>No matching events in the last 30 blocks.</p>}<ul>{events.map(e => <li key={e.id}>{e.type} · {e.key} · block {e.block}</li>)}</ul></section>
}
