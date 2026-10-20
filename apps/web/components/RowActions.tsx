'use client'
import { useState } from 'react'
import { keyChunkQueries, RpcError } from '@asi/core'
import { createBrowserRpc } from '../lib/rpc-browser'
import d from './dash/data.module.css'
export function rpcMessage(error: unknown): string { return error instanceof RpcError && (error.status === 429 || error.code === 'ANON_COST_LIMITED' || /quota|budget|rate.?limit/i.test(error.message)) ? 'RPC budget exhausted, retry later' : String(error) }
export function RowActions({ entityKey, rpcUrl }: { entityKey: string; rpcUrl: string }) {
 const [payload, setPayload] = useState(''); const [busy, setBusy] = useState(false)
 async function load() {
 setBusy(true)
 try {
 const page = await createBrowserRpc(rpcUrl).query(keyChunkQueries(null, [entityKey])[0], { select: { payload: true, contentType: true } })
 const row = page.data[0]
 if (!row) { setPayload('Entity not found'); return }
 const hex = row.payload ?? '0x'; const limited = hex.slice(2, 2 + 128 * 1024 * 2)
 const bytes = Uint8Array.from(limited.match(/.{2}/g) ?? [], b => parseInt(b,16))
 let text: string
 try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { text = '0x' + limited }
 setPayload((row.contentType ?? 'unknown content type') + '\n' + text + (hex.length > limited.length + 2 ? '\nTruncated to 128 KiB' : ''))
 } catch (e) { setPayload(rpcMessage(e)) } finally { setBusy(false) }
 }
 const nl = payload.indexOf('\n'), head = nl < 0 ? 'Payload' : payload.slice(0, nl), body = nl < 0 ? payload : payload.slice(nl + 1)
 return <><button type="button" className={d.mini} disabled={busy} aria-expanded={!!payload} onClick={() => payload ? setPayload('') : void load()}>{busy ? 'Loading…' : 'Payload'}</button>{payload && <div className={d.payload} role="region" aria-label="Entity payload"><div className={d.payloadHead}><span title={head}>{head}</span><button type="button" className="ib ib-sm" onClick={() => setPayload('')} aria-label="Close payload"><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button></div><pre>{body}</pre></div>}</>
}
