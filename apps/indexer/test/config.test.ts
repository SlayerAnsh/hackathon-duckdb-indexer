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
test('API key is optional and unused by default', () => {
  expect(loadConfig({})).toMatchObject({ apiKey: '', syncUseApiKey: false, fillUseApiKey: false, backfillMode: 'logs' })
  expect(loadConfig({ TIRAMISU_API_KEY: 'x' })).toMatchObject({ apiKey: 'x', syncUseApiKey: false })
  expect(loadConfig({ TIRAMISU_API_KEY: 'x', SYNC_USE_API_KEY: 'true' })).toMatchObject({ syncUseApiKey: true })
})
test('flags that enable the key fail fast without it', () => {
  expect(() => loadConfig({ BACKFILL_MODE: 'query' })).toThrow('BACKFILL_MODE=query requires TIRAMISU_API_KEY')
  expect(() => loadConfig({ SYNC_USE_API_KEY: 'true', TIRAMISU_API_KEY: ' ' })).toThrow('SYNC_USE_API_KEY=true requires TIRAMISU_API_KEY')
  expect(() => loadConfig({ FILL_USE_API_KEY: '1' })).toThrow('FILL_USE_API_KEY=true requires TIRAMISU_API_KEY')
  expect(loadConfig({ BACKFILL_MODE: 'query', SYNC_PAUSED: 'true' }).syncPaused).toBe(true)
})
test('startup message states whether the API key is used', async () => {
  const { keyUsage } = await import('../src/main')
  expect(keyUsage(loadConfig({ TIRAMISU_API_KEY: 'x' }))).toStartWith('API key not used')
  for (const env of [{ SYNC_USE_API_KEY: 'true' }, { FILL_USE_API_KEY: 'true' }, { BACKFILL_MODE: 'query' }]) {
    const message = keyUsage(loadConfig({ TIRAMISU_API_KEY: 'sekrit', ...env }))
    expect(message).toStartWith('Warning:')
    expect(message).toContain(Object.keys(env)[0]!)
    expect(message).not.toContain('sekrit')
  }
})
