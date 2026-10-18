import { test, expect } from 'bun:test'
import { loadConfig } from '../src/config'
test('all entity defaults and normalized expression', () => {
  for (const expression of [undefined, '', '   ']) expect(loadConfig({ TIRAMISU_API_KEY: 'x', INDEX_EXPRESSION: expression })).toMatchObject({ expression: '', backfillMode: 'logs', publicRpcUrl: 'https://rpc.tiramisu.db-chain.testnet.arkiv.network' })
  expect(loadConfig({ TIRAMISU_API_KEY: 'x', PUBLIC_RPC_URL: 'public', BACKFILL_MODE: 'query' })).toMatchObject({ publicRpcUrl: 'public', backfillMode: 'query' })
  expect(() => loadConfig({ TIRAMISU_API_KEY: 'x', BACKFILL_MODE: 'bad' })).toThrow('BACKFILL_MODE')
})
test('fill defaults use the anonymous public RPC', () => {
  expect(loadConfig({ TIRAMISU_API_KEY: 'x' })).toMatchObject({ fillRpcUrl: 'https://rpc.tiramisu.db-chain.testnet.arkiv.network', fillUseApiKey: false, fillChunk: 50, fillIntervalMs: 4000 })
  expect(loadConfig({ TIRAMISU_API_KEY: 'x', FILL_RPC_URL: 'fill', FILL_USE_API_KEY: 'true', FILL_CHUNK: '10', FILL_INTERVAL_MS: '500' })).toMatchObject({ fillRpcUrl: 'fill', fillUseApiKey: true, fillChunk: 10, fillIntervalMs: 500 })
  expect(() => loadConfig({ TIRAMISU_API_KEY: 'x', FILL_CHUNK: '51' })).toThrow('FILL_CHUNK')
})
