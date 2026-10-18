import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { syncBatch } from './sync'
import { writeDelta } from './delta'
import { createHandler, serve } from './http'
import { createRpc, hasCreatorTerm, RpcError, type ArkivRpc } from '@asi/core'
import { loadConfig, storeDir, type Config } from './config'
import { Store } from './store'
import { replayLiveKeys, replayTarget } from './replay'
import { backfill, backfillByKeys } from './backfill'
import { readManifest, writeSnapshot } from './snapshot'
async function runBackfill(config: Config, logsRpc: ArkivRpc, queryRpc: ArkivRpc, store: Store, head: number, log?: (msg: string) => void): Promise<void> {
  if (config.backfillMode === 'logs') {
    const keys = await replayLiveKeys(logsRpc, store, head, log)
    await backfillByKeys(queryRpc, store, config.expression, keys, head, log)
  } else await backfill(queryRpc, store, config.expression, head, log)
}
export async function bootstrap(config: Config, rpc: ArkivRpc, log: (msg: string) => void = console.log, queryRpc: ArkivRpc = rpc): Promise<{ store: Store; dir: string; head: number }> {
  const chainId = await rpc.chainId(), genesisHash = await rpc.genesisHash()
  const base = storeDir(config.dataDir, chainId, genesisHash)
  let dir = base
  try {
    const generation = JSON.parse(await readFile(join(base, 'active-generation.json'), 'utf8'))
    if (!Number.isSafeInteger(generation) || generation < 1) throw Error('Invalid active generation')
    dir = base + '-g' + generation
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  const store = await Store.open(dir, config.expression, chainId, genesisHash)
  try {
    if (!hasCreatorTerm(config.expression)) log('Warning: INDEX_EXPRESSION has no $creator term; attributes can be written by anyone.')
    const state = await store.state()
    const pendingTarget = config.backfillMode === 'logs' ? await replayTarget(store) : null
    const head = state?.head_block ?? pendingTarget ?? Math.max(0, await rpc.blockNumber() - config.confirmations)
    const meta = { chainId, genesisHash, expression: config.expression }
    if (!state) {
      // Preserve committed key fetches for the pending replay target.
      if (pendingTarget === null) await store.transaction(async () => { await store.conn.run('DELETE FROM attributes; DELETE FROM entities; DELETE FROM changes') })
      const hash = await rpc.blockHash(head)
      await runBackfill(config, rpc, queryRpc, store, head, log)
      if (await rpc.blockHash(head) !== hash) throw Error('Canonical header changed during backfill')
      await store.transaction(async () => { await store.setState({ start_block: head, head_block: head, head_hash: hash }) })
      await writeSnapshot(store, dir, head, meta, config.keepSnapshots)
    } else if (!await readManifest(dir)) {
      await writeSnapshot(store, dir, head, meta, config.keepSnapshots)
    }
    await writeDelta(store, dir)
    return { store, dir, head }
  } catch (error) { store.close(); throw error }
}
export async function servePaused(config: Config, log: (msg: string) => void = console.log): Promise<{ dir: string }> {
  const candidates: string[] = []
  let entries: string[] = []
  try { entries = await readdir(config.dataDir) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  for (const entry of entries.filter(name => /^\d+-0x[0-9a-f]+$/i.test(name))) {
    const base = join(config.dataDir, entry)
    let dir = base
    try {
      const generation = JSON.parse(await readFile(join(base, 'active-generation.json'), 'utf8'))
      if (!Number.isSafeInteger(generation) || generation < 1) throw Error('Invalid active generation')
      dir += '-g' + generation
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (await readManifest(dir)) candidates.push(dir)
  }
  if (!candidates.length) throw Error('No indexed store found in ' + config.dataDir)
  if (candidates.length !== 1) throw Error('Multiple indexed stores found in ' + config.dataDir)
  log('Sync paused; serving ' + candidates[0])
  return { dir: candidates[0]! }
}
export type TickContext = { rpc: ArkivRpc; queryRpc?: ArkivRpc; store: Store; dir: string; config: Config; meta: { chainId: number; genesisHash: string; expression: string }; chainHead?: number }
async function rebuild(ctx: TickContext, head: number): Promise<void> {
  const { rpc, config } = ctx
  const meta = { chainId: await rpc.chainId(), genesisHash: await rpc.genesisHash(), expression: config.expression }
  const base = storeDir(config.dataDir, meta.chainId, meta.genesisHash)
  let generation = 1
  const siblings = await readdir(config.dataDir)
  while (siblings.includes(base.split('/').pop()! + '-g' + generation)) generation++
  const dir = base + '-g' + generation
  const previousVersion = (await ctx.store.state())!.snapshot_version
  const store = await Store.open(dir, config.expression, meta.chainId, meta.genesisHash)
  try {
    const hash = await rpc.blockHash(head)
    await runBackfill(config, rpc, ctx.queryRpc ?? rpc, store, head)
    if (await rpc.blockHash(head) !== hash) throw Error('Canonical header changed during backfill')
    await store.setState({ start_block: head, head_block: head, head_hash: hash, snapshot_version: previousVersion })
    await writeSnapshot(store, dir, head, meta, config.keepSnapshots)
    await writeDelta(store, dir)
    await mkdir(base, { recursive: true })
    await writeFile(join(base, 'active-generation.json.tmp'), JSON.stringify(generation))
    await rename(join(base, 'active-generation.json.tmp'), join(base, 'active-generation.json'))
  } catch (error) { store.close(); throw error }
  const old = ctx.store
  ctx.store = store; ctx.dir = dir; ctx.meta = meta
  old.close()
}
export async function tick(ctx: TickContext): Promise<void> {
  const { rpc, store, config } = ctx
  const state = await store.state()
  if (!state) throw Error('Missing sync checkpoint')
  ctx.chainHead = await rpc.blockNumber()
  const to = ctx.chainHead - config.confirmations
  if (ctx.chainHead < state.head_block && (await rpc.genesisHash() !== state.genesis_hash || await rpc.chainId() !== state.chain_id)) {
    console.log('Chain identity changed; building a fresh generation')
    await rebuild(ctx, Math.max(0, to)); return
  }
  if (to - state.head_block < config.syncBatchBlocks) return
  const hash = await rpc.blockHash(state.head_block)
  if (!state.head_hash || hash !== state.head_hash) {
    console.log('Checkpoint hash mismatch or legacy checkpoint; building a fresh generation')
    await rebuild(ctx, Math.max(0, to)); return
  }
  try { await syncBatch(rpc, store, config.expression, state.head_block + 1, to, ctx.queryRpc ?? rpc) }
  catch (error) {
    if (!(error instanceof RpcError && error.code === -32006)) throw error
    // Verify the provider is still ahead before treating unavailable state as a retained-range gap.
    if (await rpc.blockNumber() < to) throw error
    console.log('Historical state unavailable; building a fresh generation')
    await rebuild(ctx, Math.max(0, to)); return
  }
  await writeDelta(store, ctx.dir)
  if (to - state.snapshot_block >= config.snapshotIntervalBlocks) {
    await writeSnapshot(store, ctx.dir, to, ctx.meta, config.keepSnapshots)
    await writeDelta(store, ctx.dir)
  }
}
if (import.meta.main) {
  try {
    const config = loadConfig(process.env)
    if (config.syncPaused) {
      const { dir } = await servePaused(config)
      const manifest = (await readManifest(dir))!
      serve(config.port, createHandler(dir, () => ({ paused: true, headBlock: manifest.headBlock, lastSnapshot: manifest.snapshotBlock })))
    } else {
    const rpc = createRpc(config.publicRpcUrl)
    const queryRpc = createRpc(config.rpcUrl, { apiKey: config.apiKey, onCost: (cost, quota) => console.log('RPC cost: ' + cost + '; quota used: ' + (quota === null ? 'unknown' : quota + '%')) })
    const result = await bootstrap(config, rpc, console.log, queryRpc)
    const state = (await result.store.state())!
    const ctx: TickContext = { ...result, rpc, queryRpc, config, meta: { chainId: state.chain_id, genesisHash: state.genesis_hash, expression: config.expression } }
    let health: object = { headBlock: state.head_block, headLag: null, lastSnapshot: state.snapshot_block }
    let servingDir = ctx.dir, handler = createHandler(servingDir, () => health)
    serve(config.port, req => {
      if (servingDir !== ctx.dir) { servingDir = ctx.dir; handler = createHandler(servingDir, () => health) }
      return handler(req)
    })
    console.log('Indexed through block ' + result.head + ' at ' + result.dir)
    let running = false
    setInterval(async () => {
      if (running) return
      running = true
      try {
        await tick(ctx)
        const latest = (await ctx.store.state())!
        health = { headBlock: latest.head_block, headLag: ctx.chainHead === undefined ? null : ctx.chainHead - latest.head_block, lastSnapshot: latest.snapshot_block }
      } catch (error) {
        if (error instanceof RpcError && error.status === 429) console.error('RPC rate limited; Retry-After: ' + (error.retryAfter ?? 'unknown'))
        else console.error(error instanceof Error ? error.message : String(error))
      } finally { running = false }
    }, 2000)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
