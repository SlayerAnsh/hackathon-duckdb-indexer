import { expect, test } from 'bun:test'
import { CHAINS, arkivChain, chainNameOf } from '../lib/chain'

test('chain selection defaults to Tiramisu and accepts Rabdi', () => {
 expect(chainNameOf(undefined)).toBe('tiramisu'); expect(chainNameOf('')).toBe('tiramisu'); expect(chainNameOf('nope')).toBe('tiramisu')
 expect(chainNameOf(' Rabdi ')).toBe('rabdi')
 expect(CHAINS.tiramisu.chain.id).toBe(7738577)
 expect(CHAINS.rabdi.chain.id).toBe(7794095)
 expect(CHAINS.rabdi.chain.rpcUrls.default.http).toEqual(['https://rpc.rabdi.db-chain.testnet.arkiv.network'])
 expect(CHAINS.rabdi.explorerUrl).toBe('https://rabdi.explorer.arkiv.network')
 expect(arkivChain('https://r.example').rpcUrls.default.http).toEqual(['https://r.example'])
})
