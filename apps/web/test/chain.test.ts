import { expect, test } from 'bun:test'
import { ARKIV_CHAIN, ARKIV_CHAIN_ID, DEFAULT_EXPLORER_URL, DEFAULT_RPC_URL, arkivChain } from '../lib/chain'

test('the app runs on the Rabdi testnet', () => {
 expect(ARKIV_CHAIN_ID).toBe(7794095); expect(ARKIV_CHAIN.name).toBe('Rabdi'); expect(ARKIV_CHAIN.nativeCurrency.symbol).toBe('GLM')
 expect(DEFAULT_RPC_URL).toBe('https://rpc.rabdi.db-chain.testnet.arkiv.network')
 expect(DEFAULT_EXPLORER_URL).toBe('https://rabdi.explorer.arkiv.network')
 expect(arkivChain('https://r.example').rpcUrls.default.http).toEqual(['https://r.example'])
})
