import { test, expect } from 'bun:test'
import { loadConfig } from '../src/config'
test('all entity defaults and normalized expression', () => {
  for (const expression of [undefined, '', '   ']) expect(loadConfig({ TIRAMISU_API_KEY: 'x', INDEX_EXPRESSION: expression })).toMatchObject({ expression: '', backfillMode: 'logs', publicRpcUrl: 'https://rpc.tiramisu.db-chain.testnet.arkiv.network' })
  expect(loadConfig({ TIRAMISU_API_KEY: 'x', PUBLIC_RPC_URL: 'public', BACKFILL_MODE: 'query' })).toMatchObject({ publicRpcUrl: 'public', backfillMode: 'query' })
  expect(() => loadConfig({ TIRAMISU_API_KEY: 'x', BACKFILL_MODE: 'bad' })).toThrow('BACKFILL_MODE')
})
