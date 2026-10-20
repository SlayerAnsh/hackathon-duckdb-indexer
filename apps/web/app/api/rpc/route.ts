import { handleRpcProxy, readRpcProxyEnv, TokenBucket } from '../../../lib/dash/server/rpc-proxy'

export const dynamic = 'force-dynamic'

declare global {
  var __rpcProxyLimiter: TokenBucket | undefined
}

export async function POST(req: Request) {
  // 10 requests per second per client IP with a burst of 30.
  globalThis.__rpcProxyLimiter ??= new TokenBucket(10, 30)
  return handleRpcProxy(req, { ...readRpcProxyEnv(process.env), limiter: globalThis.__rpcProxyLimiter })
}
