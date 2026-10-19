import { isHexAddress } from './schema'

export type PublicDashConfig = { enabled: boolean; privyAppId: string; wallet: string; rpcUrl: string }
export function readPublicDashConfig(env: { privyAppId?: string; wallet?: string; rpcUrl?: string }): PublicDashConfig {
  const privyAppId = env.privyAppId?.trim() ?? ''
  const wallet = (env.wallet ?? '').toLowerCase()
  return { enabled: privyAppId.length > 0 && isHexAddress(wallet), privyAppId, wallet,
    rpcUrl: env.rpcUrl || 'https://rpc.tiramisu.db-chain.testnet.arkiv.network' }
}
export function publicDashConfig(): PublicDashConfig {
  return readPublicDashConfig({ privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    wallet: process.env.NEXT_PUBLIC_DASHBOARD_WALLET, rpcUrl: process.env.NEXT_PUBLIC_TIRAMISU_RPC_URL })
}
