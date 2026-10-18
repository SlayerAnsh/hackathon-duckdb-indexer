import { createRpc, hasCreatorTerm, type ArkivRpc } from '@asi/core'
import { loadConfig, storeDir, type Config } from './config'
import { Store } from './store'
import { backfill } from './backfill'
import { readManifest, writeSnapshot } from './snapshot'
export async function bootstrap(config: Config, rpc: ArkivRpc, log: (msg: string) => void = console.log): Promise<{ store: Store; dir: string; head: number }> {
  const chainId = await rpc.chainId(), genesisHash = await rpc.genesisHash()
  const dir = storeDir(config.dataDir, chainId, genesisHash)
  const store = await Store.open(dir, config.expression, chainId, genesisHash)
  try {
    if (!hasCreatorTerm(config.expression)) log('Warning: INDEX_EXPRESSION has no $creator term; attributes can be written by anyone.')
    const state = await store.state()
    const head = state?.head_block ?? Math.max(0, await rpc.blockNumber() - config.confirmations)
    const meta = { chainId, genesisHash, expression: config.expression }
    if (!state) {
      // An interrupted backfill has no checkpoint. Discard its partial rows before a new pinned scan.
      await store.transaction(async () => { await store.conn.run('DELETE FROM attributes; DELETE FROM entities; DELETE FROM changes') })
      await backfill(rpc, store, config.expression, head, log)
      await store.transaction(async () => { await store.setState({ start_block: head, head_block: head }) })
      await writeSnapshot(store, dir, head, meta, config.keepSnapshots)
    } else if (!await readManifest(dir)) {
      await writeSnapshot(store, dir, head, meta, config.keepSnapshots)
    }
    return { store, dir, head }
  } catch (error) { store.close(); throw error }
}
if (import.meta.main) {
  try {
    const config = loadConfig(process.env)
    const rpc = createRpc(config.rpcUrl, { apiKey: config.apiKey, onCost: (cost, quota) => console.log('RPC cost: ' + cost + '; quota used: ' + (quota === null ? 'unknown' : quota + '%')) })
    const result = await bootstrap(config, rpc)
    console.log('Indexed through block ' + result.head + ' at ' + result.dir)
    result.store.close()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
