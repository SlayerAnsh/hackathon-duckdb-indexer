'use client'
import { useState } from 'react'
import { keyChunkQueries, RpcError } from '@asi/core'
import { createBrowserRpc } from '../lib/rpc-browser'
export function rpcMessage(error: unknown): string { return error instanceof RpcError && (error.status === 429 || error.code === 'ANON_COST_LIMITED') ? 'RPC budget exhausted, retry later' : String(error) }
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
 return <><button disabled={busy} onClick={() => void load()}>Payload</button>{payload && <details open><summary>Payload <button onClick={() => setPayload('')}>Close</button></summary><pre>{payload}</pre></details>}</>
}
