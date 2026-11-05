import { tiramisu } from '@arkiv-network/sdk/chains'
import { defineChain, type Chain } from 'viem'

/** Rabdi DB-Chain testnet (https://stage.docs.arkiv.network). SDK 0.8.1 ships no definition, so it lives here. */
export const rabdi = defineChain({
 id: 7794095,
 name: 'Rabdi',
 network: 'rabdi',
 nativeCurrency: { name: 'Golem', symbol: 'GLM', decimals: 18 },
 rpcUrls: { default: {
  http: ['https://rpc.rabdi.db-chain.testnet.arkiv.network'],
  webSocket: ['wss://rpc.rabdi.db-chain.testnet.arkiv.network'] } },
 testnet: true,
})

export type ChainName = 'tiramisu' | 'rabdi'
type ChainEntry = { chain: Chain; explorerUrl: string }
export const CHAINS: Record<ChainName, ChainEntry> = {
 tiramisu: { chain: tiramisu, explorerUrl: 'https://tiramisu.explorer.arkiv.network' },
 rabdi: { chain: rabdi, explorerUrl: 'https://rabdi.explorer.arkiv.network' },
}

/** Unknown or blank names fall back to Tiramisu, the chain the hosted index covers. */
export function chainNameOf(value: string | undefined): ChainName {
 const name = value?.trim().toLowerCase()
 return name === 'rabdi' ? 'rabdi' : 'tiramisu'
}

// Literal process.env access so Next.js inlines the value into browser bundles at build time.
export const CHAIN_NAME: ChainName = chainNameOf(process.env.NEXT_PUBLIC_ARKIV_CHAIN)
export const ARKIV_CHAIN: Chain = CHAINS[CHAIN_NAME].chain
export const ARKIV_CHAIN_ID = ARKIV_CHAIN.id
export const DEFAULT_RPC_URL = ARKIV_CHAIN.rpcUrls.default.http[0]
export const DEFAULT_EXPLORER_URL = CHAINS[CHAIN_NAME].explorerUrl

/** The selected chain with its RPC replaced by the configured URL. */
export function arkivChain(rpcUrl: string): Chain {
 return { ...ARKIV_CHAIN, rpcUrls: { default: { http: [rpcUrl] } } }
}
