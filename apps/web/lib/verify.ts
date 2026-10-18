import { keyChunkQueries } from '@asi/core'
import { createBrowserRpc } from './rpc-browser'
export type VerifyStatus = 'ok' | 'stale' | 'extended' | 'expired' | 'deleted' | 'error'
export function classifyVerify(row: { updated_at: number; expires_at: number }, chain: { updatedAt: number; expiresAt: number } | null, head: number): VerifyStatus {
 if (!chain) return 'deleted'
 if (chain.expiresAt <= head) return 'expired'
 if (chain.updatedAt > row.updated_at) return chain.expiresAt > row.expires_at ? 'extended' : 'stale'
 return chain.updatedAt === row.updated_at && chain.expiresAt === row.expires_at ? 'ok' : 'stale'
}
export async function verifyRows(rpcUrl: string, keys: string[]): Promise<Map<string, { updatedAt: number; expiresAt: number; owner: string } | null>> {
 const rpc = createBrowserRpc(rpcUrl)
 const result = new Map<string, { updatedAt: number; expiresAt: number; owner: string } | null>(keys.map(k => [k.toLowerCase(), null]))
 for (const expression of keyChunkQueries(null, [...new Set(keys)])) {
 let cursor: string | undefined
 do {
 const page = await rpc.query(expression, { cursor, select: { key: true, updatedAt: true, expiresAt: true, owner: true } })
 for (const row of page.data) if (row.key && row.owner) result.set(row.key.toLowerCase(), { updatedAt: Number(row.updatedAt), expiresAt: Number(row.expiresAt), owner: row.owner })
 cursor = page.cursor
 } while (cursor)
 }
 return result
}
