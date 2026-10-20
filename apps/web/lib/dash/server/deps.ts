import { PrivyClient } from '@privy-io/node'
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { createRpc } from '@asi/core'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { AuthDeps } from './auth'
import { readServerDashConfig, type ServerDashConfig } from './config'
import { NonceStore } from './nonce'
import type { OpsDeps } from './operations'
import { createPrivyVerifier } from './privy'
import { WriteQueue } from './queue'
import { GLOBAL_WRITE_RULES, NONCE_RULES, RateLimiter, WRITE_RULES } from './rate-limit'

export type DashDeps = AuthDeps & { ops: OpsDeps; writeLimiter: RateLimiter; globalLimiter: RateLimiter }
type DashDepsState = DashDeps | { disabled: string }
declare global {
  var __dashDeps: DashDepsState | undefined
}
// The API key only raises the read budget of reader (arkiv_query); writes stay on the public transport.
export function buildOps(privateKey: `0x${string}`, rpcUrl: string, apiKey = process.env.TIRAMISU_API_KEY?.trim() || undefined): OpsDeps {
  const account = privateKeyToAccount(privateKey)
  const wallet = createWalletClient({ chain: tiramisu, account, transport: http(rpcUrl) })
  const publicClient = createPublicClient({ chain: tiramisu, cacheTime: 0,
    transport: http(rpcUrl, { fetchOptions: { cache: 'no-store' } }) })
  const client = { ...wallet, predictEntityKeys: publicClient.predictEntityKeys }
  return { client, reader: createRpc(rpcUrl, { apiKey }), wallet: account.address.toLowerCase(), queue: new WriteQueue(25) }
}
export function buildDashDeps(config: ServerDashConfig): DashDeps {
  const now = Date.now
  return { config, now,
    privy: createPrivyVerifier(new PrivyClient({ appId: config.privyAppId, appSecret: config.privyAppSecret })),
    nonces: new NonceStore({ now }), nonceLimiter: new RateLimiter(NONCE_RULES, now),
    writeLimiter: new RateLimiter(WRITE_RULES, now), globalLimiter: new RateLimiter(GLOBAL_WRITE_RULES, now),
    ops: buildOps(config.privateKey, config.rpcUrl) }
}
export function getDashDeps(): DashDepsState {
  if (!globalThis.__dashDeps) {
    const result = readServerDashConfig(process.env)
    globalThis.__dashDeps = result.ok ? buildDashDeps(result.config) : { disabled: result.reason }
  }
  return globalThis.__dashDeps
}
