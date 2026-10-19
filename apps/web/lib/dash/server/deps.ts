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
export function buildDashDeps(config: ServerDashConfig): DashDeps {
  const now = Date.now
  const account = privateKeyToAccount(config.privateKey)
  const wallet = createWalletClient({ chain: tiramisu, account, transport: http(config.rpcUrl) })
  const publicClient = createPublicClient({ chain: tiramisu, cacheTime: 0,
    transport: http(config.rpcUrl, { fetchOptions: { cache: 'no-store' } }) })
  const client = { ...wallet, predictEntityKeys: publicClient.predictEntityKeys }
  return { config, now,
    privy: createPrivyVerifier(new PrivyClient({ appId: config.privyAppId, appSecret: config.privyAppSecret })),
    nonces: new NonceStore({ now }), nonceLimiter: new RateLimiter(NONCE_RULES, now),
    writeLimiter: new RateLimiter(WRITE_RULES, now), globalLimiter: new RateLimiter(GLOBAL_WRITE_RULES, now),
    ops: { client, reader: createRpc(config.rpcUrl), wallet: config.wallet, queue: new WriteQueue(25) } }
}
export function getDashDeps(): DashDepsState {
  if (!globalThis.__dashDeps) {
    const result = readServerDashConfig(process.env)
    globalThis.__dashDeps = result.ok ? buildDashDeps(result.config) : { disabled: result.reason }
  }
  return globalThis.__dashDeps
}
