import { DEFAULT_RPC_URL } from '../../chain'
import { privateKeyToAccount } from 'viem/accounts'
import { deriveSessionSecret } from './session'

export type ServerDashConfig = {
  privyAppId: string; privyAppSecret: string; privateKey: `0x${string}`
  wallet: string; rpcUrl: string; sessionSecret: Buffer
}
export function readServerDashConfig(env: Record<string, string | undefined>):
  { ok: true; config: ServerDashConfig } | { ok: false; reason: string } {
  for (const name of ['NEXT_PUBLIC_PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'DASHBOARD_PRIVATE_KEY']) {
    if (!env[name]?.trim()) return { ok: false, reason: `${name} is required` }
  }
  const privateKey = env.DASHBOARD_PRIVATE_KEY!
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) return { ok: false, reason: 'DASHBOARD_PRIVATE_KEY must be a 32 byte hex key' }
  let wallet: string
  try { wallet = privateKeyToAccount(privateKey as `0x${string}`).address.toLowerCase() }
  catch { return { ok: false, reason: 'DASHBOARD_PRIVATE_KEY is invalid' } }
  return { ok: true, config: { privyAppId: env.NEXT_PUBLIC_PRIVY_APP_ID!.trim(), privyAppSecret: env.PRIVY_APP_SECRET!,
    privateKey: privateKey as `0x${string}`, wallet,
    rpcUrl: env.NEXT_PUBLIC_TIRAMISU_RPC_URL?.trim() || DEFAULT_RPC_URL,
    sessionSecret: deriveSessionSecret(env.PRIVY_APP_SECRET!) } }
}
