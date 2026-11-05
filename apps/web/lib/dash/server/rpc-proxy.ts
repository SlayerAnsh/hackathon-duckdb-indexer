import { DEFAULT_RPC_URL } from '../../chain'
import { clientIp } from './auth'

// Read only JSON-RPC methods the browser sends: @asi/core createRpc (query, blockNumber, chainId,
// genesisHash/blockHash, getLogs) and viem getBalance for the wallet balance chip.
export const READ_METHODS: ReadonlySet<string> = new Set([
  'arkiv_query', 'eth_blockNumber', 'eth_chainId', 'eth_getBlockByNumber', 'eth_getLogs', 'eth_getBalance',
])
export { DEFAULT_RPC_URL }
export const MAX_BODY_BYTES = 64 * 1024
export const MAX_BATCH = 20
export const UPSTREAM_TIMEOUT_MS = 15_000

type JsonRpcId = string | number | null
type JsonRpcRequest = { jsonrpc: '2.0'; id?: JsonRpcId; method: string; params?: unknown }

export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; at: number }>()
  constructor(private readonly ratePerSec: number, private readonly burst: number, private readonly now: () => number = Date.now, private readonly maxKeys = 10_000) {}
  take(id: string, cost = 1): boolean {
    const now = this.now()
    const prev = this.buckets.get(id)
    const tokens = prev ? Math.min(this.burst, prev.tokens + (now - prev.at) / 1000 * this.ratePerSec) : this.burst
    if (!prev && this.buckets.size >= this.maxKeys) this.prune(now)
    if (tokens < cost) { this.buckets.set(id, { tokens, at: now }); return false }
    this.buckets.set(id, { tokens: tokens - cost, at: now })
    return true
  }
  private prune(now: number) {
    for (const [id, bucket] of this.buckets)
      if (bucket.tokens + (now - bucket.at) / 1000 * this.ratePerSec >= this.burst) this.buckets.delete(id)
    if (this.buckets.size >= this.maxKeys) this.buckets.clear()
  }
}

export type RpcProxyDeps = {
  upstreamUrl: string
  apiKey?: string
  fetchImpl?: typeof fetch
  limiter: TokenBucket
  timeoutMs?: number
}

export function readRpcProxyEnv(env: Record<string, string | undefined>): { upstreamUrl: string; apiKey?: string } {
  const apiKey = env.ARKIV_API_KEY?.trim()
  return { upstreamUrl: env.NEXT_PUBLIC_ARKIV_RPC_URL?.trim() || DEFAULT_RPC_URL, ...(apiKey ? { apiKey } : {}) }
}

function rpcError(status: number, code: number, message: string, id: JsonRpcId = null, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })
}

async function readCapped(req: Request, cap: number): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > cap) return null
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > cap) { await reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(all)
}

function validId(id: unknown): id is JsonRpcId | undefined {
  return id === undefined || id === null || typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id))
}

function check(entry: unknown): { ok: true; request: JsonRpcRequest } | { ok: false; id: JsonRpcId; code: number; message: string } {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return { ok: false, id: null, code: -32600, message: 'Invalid request' }
  const { jsonrpc, id, method, params } = entry as Record<string, unknown>
  const safeId = validId(id) ? id ?? null : null
  if (jsonrpc !== '2.0' || !validId(id) || typeof method !== 'string' || (params !== undefined && !Array.isArray(params)))
    return { ok: false, id: safeId, code: -32600, message: 'Invalid request' }
  if (!READ_METHODS.has(method)) return { ok: false, id: safeId, code: -32601, message: 'Method not allowed by the read proxy' }
  return { ok: true, request: { jsonrpc: '2.0', ...(id !== undefined ? { id } : {}), method, ...(params !== undefined ? { params } : {}) } }
}

export async function handleRpcProxy(req: Request, deps: RpcProxyDeps): Promise<Response> {
  if (!deps.limiter.take(clientIp(req))) return rpcError(429, -32005, 'Too many requests', null, { 'retry-after': '1' })
  const text = await readCapped(req, MAX_BODY_BYTES)
  if (text === null) return rpcError(413, -32600, 'Request body too large')
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return rpcError(400, -32700, 'Parse error') }
  const batch = Array.isArray(parsed)
  const entries = batch ? parsed as unknown[] : [parsed]
  if (entries.length === 0 || entries.length > MAX_BATCH) return rpcError(400, -32600, `Batch must hold 1 to ${MAX_BATCH} requests`)
  const requests: JsonRpcRequest[] = []
  for (const entry of entries) {
    const result = check(entry)
    if (!result.ok) return rpcError(400, result.code, result.message, batch ? null : result.id)
    requests.push(result.request)
  }
  // A batch costs one token per call; the first token was taken above.
  if (requests.length > 1 && !deps.limiter.take(clientIp(req), requests.length - 1)) return rpcError(429, -32005, 'Too many requests', null, { 'retry-after': '1' })

  let upstream: Response
  try {
    upstream = await (deps.fetchImpl ?? fetch)(deps.upstreamUrl, {
      method: 'POST', cache: 'no-store',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(deps.apiKey ? { authorization: `Bearer ${deps.apiKey}` } : {}) },
      body: JSON.stringify(batch ? requests : requests[0]),
      signal: AbortSignal.timeout(deps.timeoutMs ?? UPSTREAM_TIMEOUT_MS),
    })
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return rpcError(timeout ? 504 : 502, -32603, timeout ? 'Upstream RPC timed out' : 'Upstream RPC unavailable', batch ? null : requests[0].id ?? null)
  }
  let body = await upstream.text().catch(() => '')
  if (deps.apiKey && body.includes(deps.apiKey)) body = body.split(deps.apiKey).join('[redacted]')
  const headers: Record<string, string> = { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' }
  const retryAfter = upstream.headers.get('retry-after')
  if (retryAfter) headers['retry-after'] = retryAfter
  return new Response(body, { status: upstream.status, headers })
}
