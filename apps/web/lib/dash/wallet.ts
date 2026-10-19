import { createPublicClient, createWalletClient, type WalletArkivClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { custom, formatEther, http, type Chain, type Transport } from 'viem'
import { isHexAddress } from './schema'

export const TIRAMISU_CHAIN_ID = 7738577
export const MIN_SIGNING_BALANCE_WEI = BigInt(10) ** BigInt(17)
export type Eip1193 = { request(args: { method: string; params?: unknown }): Promise<unknown> }
export function tiramisuChain(rpcUrl: string): Chain {
 return { ...tiramisu, rpcUrls: { default: { http: [rpcUrl] } } }
}
const walletMethods = new Set(['eth_sendTransaction', 'eth_signTransaction', 'eth_accounts', 'eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'personal_sign', 'eth_sign', 'eth_signTypedData_v4'])
export function routeRpc(method: string): 'wallet' | 'rpc' { return walletMethods.has(method) ? 'wallet' : 'rpc' }
export function splitTransport(wallet: Eip1193, rpc: Eip1193): Transport {
 return custom({ request: args => routeRpc(args.method) === 'wallet' ? wallet.request(args) : rpc.request(args) })
}
export type UserWalletClient = Pick<WalletArkivClient, 'account' | 'extendEntity' | 'deleteEntity' | 'changeOwnership' | 'getBlockNumber'>
export function createUserWalletClient(provider: Eip1193, address: `0x${string}`, rpcUrl: string): UserWalletClient {
 const chain = tiramisuChain(rpcUrl)
 const rpcSide = http(rpcUrl)({ chain, retryCount: 0 })
 return createWalletClient({ chain, account: address, transport: splitTransport(provider, rpcSide) })
}
export type BalanceLevel = 'unknown' | 'empty' | 'low' | 'ok'
export function balanceLevel(wei: bigint | null): BalanceLevel {
 return wei === null ? 'unknown' : wei === BigInt(0) ? 'empty' : wei < MIN_SIGNING_BALANCE_WEI ? 'low' : 'ok'
}
export function formatGlm(wei: bigint): string {
 const [whole, fraction = ''] = formatEther(wei).split('.')
 const decimals = fraction.slice(0, 4).replace(/0+$/, '')
 return `${whole}${decimals ? '.' + decimals : ''} ${tiramisu.nativeCurrency.symbol}`
}
export async function readBalance(rpcUrl: string, address: string, client?: { getBalance(a: { address: `0x${string}` }): Promise<bigint> }): Promise<bigint | null> {
 if (!isHexAddress(address)) return null
 try {
  const reader = client ?? createPublicClient({ chain: tiramisuChain(rpcUrl), transport: http(rpcUrl) })
  return await reader.getBalance({ address: address as `0x${string}` })
 } catch { return null }
}
