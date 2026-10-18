import { join } from 'node:path'
const PUBLIC_RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
export type Config = { publicRpcUrl: string; fillRpcUrl: string; fillUseApiKey: boolean; fillChunk: number; fillIntervalMs: number; backfillMode: 'logs' | 'query'; syncPaused: boolean; rpcUrl: string; apiKey: string; expression: string; confirmations: number; syncBatchBlocks: number; snapshotIntervalBlocks: number; keepSnapshots: number; dataDir: string; port: number }
export function loadConfig(env: Record<string, string | undefined>): Config {
  const syncPaused = env.SYNC_PAUSED === 'true' || env.SYNC_PAUSED === '1'
  for (const name of (syncPaused ? [] : ['TIRAMISU_API_KEY'])) if (!env[name]?.trim()) throw Error(name + ' is required')
  const backfillMode = env.BACKFILL_MODE ?? 'logs'
  if (backfillMode !== 'logs' && backfillMode !== 'query') throw Error('Invalid BACKFILL_MODE')
  const integer = (name: string, fallback: number, min = 1) => {
    const value = env[name] === undefined ? fallback : Number(env[name])
    if (!Number.isSafeInteger(value) || value < min) throw Error(name + ' must be an integer >= ' + min)
    return value
  }
  const fillChunk = integer('FILL_CHUNK', 50)
  // Arkiv rejects more than 50 $key terms in one query.
  if (fillChunk > 50) throw Error('FILL_CHUNK must be an integer <= 50')
  return { publicRpcUrl: env.PUBLIC_RPC_URL ?? PUBLIC_RPC, fillRpcUrl: env.FILL_RPC_URL ?? PUBLIC_RPC, fillUseApiKey: env.FILL_USE_API_KEY === 'true' || env.FILL_USE_API_KEY === '1', fillChunk, fillIntervalMs: integer('FILL_INTERVAL_MS', 4000), backfillMode, syncPaused, rpcUrl: env.ARKIV_RPC_URL ?? 'https://rpc.tiramisu.db-chain.testnet.arkiv.network', apiKey: env.TIRAMISU_API_KEY ?? '', expression: env.INDEX_EXPRESSION?.trim() ?? '', confirmations: integer('CONFIRMATIONS', 3, 0), syncBatchBlocks: integer('SYNC_BATCH_BLOCKS', 5), snapshotIntervalBlocks: integer('SNAPSHOT_INTERVAL_BLOCKS', 30), keepSnapshots: integer('KEEP_SNAPSHOTS', 2), dataDir: env.DATA_DIR ?? './data', port: integer('PORT', 8080) }
}
export function storeDir(dataDir: string, chainId: number, genesisHash: string): string {
  return join(dataDir, chainId + '-' + genesisHash.slice(0, 12))
}
