import { isHexAddress } from './schema'

export type PublicDashConfig = { enabled: boolean; privyAppId: string; wallet: string; rpcUrl: string }
export function readPublicDashConfig(env: { privyAppId?: string; wallet?: string | null; rpcUrl?: string }): PublicDashConfig {
  const privyAppId = env.privyAppId?.trim() ?? ''
  const wallet = (env.wallet ?? '').toLowerCase()
  return { enabled: privyAppId.length > 0 && isHexAddress(wallet), privyAppId, wallet,
    rpcUrl: env.rpcUrl || 'https://rpc.tiramisu.db-chain.testnet.arkiv.network' }
}
let walletRequest: Promise<string | null> | undefined
export function fetchDashWallet(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!walletRequest) {
    walletRequest = Promise.resolve().then(async () => {
      const response = await fetchImpl('/api/dash/config', { cache: 'no-store' })
      if (!response.ok) throw new Error('Dashboard config unavailable')
      const body = await response.json()
      if (body?.wallet === null) return null
      if (typeof body?.wallet !== 'string' || !isHexAddress(body.wallet)) throw new Error('Invalid dashboard config')
      return body.wallet.toLowerCase()
    }).catch(() => { walletRequest = undefined; return null })
  }
  return walletRequest
}
