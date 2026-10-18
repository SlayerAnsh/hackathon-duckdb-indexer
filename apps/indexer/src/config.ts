import { join } from 'node:path'
export type Config = { syncPaused: boolean; rpcUrl: string; apiKey: string; expression: string; confirmations: number; syncBatchBlocks: number; snapshotIntervalBlocks: number; keepSnapshots: number; dataDir: string; port: number }
export function loadConfig(env: Record<string, string | undefined>): Config {
  const syncPaused = env.SYNC_PAUSED === 'true' || env.SYNC_PAUSED === '1'
  for (const name of (syncPaused ? ['INDEX_EXPRESSION'] : ['INDEX_EXPRESSION', 'TIRAMISU_API_KEY'])) if (!env[name]?.trim()) throw Error(name + ' is required')
  const integer = (name: string, fallback: number, min = 1) => {
    const value = env[name] === undefined ? fallback : Number(env[name])
    if (!Number.isSafeInteger(value) || value < min) throw Error(name + ' must be an integer >= ' + min)
    return value
  }
  return { syncPaused, rpcUrl: env.ARKIV_RPC_URL ?? 'https://rpc.tiramisu.db-chain.testnet.arkiv.network', apiKey: env.TIRAMISU_API_KEY ?? '', expression: env.INDEX_EXPRESSION!, confirmations: integer('CONFIRMATIONS', 3, 0), syncBatchBlocks: integer('SYNC_BATCH_BLOCKS', 5), snapshotIntervalBlocks: integer('SNAPSHOT_INTERVAL_BLOCKS', 30), keepSnapshots: integer('KEEP_SNAPSHOTS', 2), dataDir: env.DATA_DIR ?? './data', port: integer('PORT', 8080) }
}
export function storeDir(dataDir: string, chainId: number, genesisHash: string): string {
  return join(dataDir, chainId + '-' + genesisHash.slice(0, 12))
}
