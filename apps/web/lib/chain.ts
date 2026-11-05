import { defineChain, type Chain } from 'viem'

/** Rabdi DB-Chain testnet (https://stage.docs.arkiv.network). Local definition for the configured Rabdi RPC. */
export const ARKIV_CHAIN = defineChain({
 id: 7794095,
 name: 'Rabdi',
 network: 'rabdi',
 nativeCurrency: { name: 'Golem', symbol: 'tGLM', decimals: 18 },
 rpcUrls: { default: {
  http: ['https://rpc.rabdi.db-chain.testnet.arkiv.network'],
  webSocket: ['wss://rpc.rabdi.db-chain.testnet.arkiv.network'] } },
 testnet: true,
})
export const ARKIV_CHAIN_ID = ARKIV_CHAIN.id
export const DEFAULT_RPC_URL = ARKIV_CHAIN.rpcUrls.default.http[0]
export const DEFAULT_EXPLORER_URL = 'https://rabdi.explorer.arkiv.network'

/** The chain with its RPC replaced by the configured URL. */
export function arkivChain(rpcUrl: string): Chain {
 return { ...ARKIV_CHAIN, rpcUrls: { default: { http: [rpcUrl] } } }
}
