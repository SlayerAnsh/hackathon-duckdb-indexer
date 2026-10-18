import * as T from '@duckdb/node-api'
import { clampBlock, ENTITY_EVENTS_ABI, decodeEventLog, decodeEntity, keyChunkQueries, ownerTerms, ROW_SELECT, RpcError, type ArkivRpc, type RawLog } from '@asi/core'
import { ensureMisses } from './fill'
import type { Store } from './store'
export function touchedFromLogs(logs: RawLog[]): { keys: string[]; createdBy: Map<string, string> } {
  const keys = new Set<string>(), createdBy = new Map<string, string>()
  for (const log of logs) {
    const topics = log.topics.map(t => t.toLowerCase()) as [`0x${string}`, ...`0x${string}`[]]
    const decoded = decodeEventLog({ abi: ENTITY_EVENTS_ABI, topics, data: log.data as `0x${string}` })
    const key = topics[1]!
    keys.add(key)
    if (decoded.eventName === 'EntityCreated') createdBy.set(key, '0x' + topics[2]!.slice(-40))
  }
  return { keys: [...keys], createdBy }
}
// Logs for [from, to] in windows of 1,000 blocks; capacity errors split a window in half.
async function batchLogs(rpc: ArkivRpc, from: number, to: number): Promise<RawLog[]> {
  async function logs(start: number, end: number): Promise<RawLog[]> {
    try { return await rpc.getLogs(start, end) }
    catch (error) {
      if (!(error instanceof RpcError && error.code === -32602 && /max results/i.test(error.message)) || start === end) throw error
      const mid = Math.floor((start + end) / 2)
      return [...await logs(start, mid), ...await logs(mid + 1, end)]
    }
  }
  const all: RawLog[] = []
  for (let start = from; start <= to; start += 1000) all.push(...await logs(start, Math.min(to, start + 999)))
  return all
}

// Keyless live sync: applies operation logs to the rows directly and leaves attribute fetches to the filler.
// Creations and patches mark rows attrs_pending; the filler re-fetches them newest first.
export async function syncLogs(rpc: ArkivRpc, store: Store, expression: string, from: number, to: number): Promise<{ created: number; updated: number; removed: number }> {
  const targetHash = await rpc.blockHash(to)
  const all = (await batchLogs(rpc, from, to)).sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
  const terms = ownerTerms(expression), owners = new Set([...terms.creators, ...terms.owners])
  return store.transaction(async () => {
    await ensureMisses(store)
    const indexed = await store.indexedKeys(), changed = new Set<string>()
    let created = 0, updated = 0, removed = 0
    const run = (sql: string, values: (string | number | boolean)[], types: T.DuckDBType[]) => store.conn.run(sql, values, types)
    for (const log of all) {
      const topics = log.topics.map(t => t.toLowerCase()) as [`0x${string}`, ...`0x${string}`[]]
      const decoded = decodeEventLog({ abi: ENTITY_EVENTS_ABI, topics, data: log.data as `0x${string}` })
      const args = decoded.args as { entityKey: string; owner?: string; newOwner?: string; expiresAt?: bigint; creationFlags?: number }
      const key = args.entityKey.toLowerCase(), block = log.blockNumber
      if (decoded.eventName === 'EntityCreated') {
        const owner = args.owner!.toLowerCase()
        // Same relevance prefilter as keyed sync; the filler drops rows outside any other filter terms.
        if (owners.size && !owners.has(owner)) continue
        await run('DELETE FROM attributes WHERE key = ?', [key], [T.VARCHAR])
        await run('INSERT OR REPLACE INTO entities (key, owner, creator, created_at, updated_at, expires_at, content_type, creation_flags, attrs_pending) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, true)',
          [key, owner, owner, block, block, clampBlock(args.expiresAt!), Number(args.creationFlags)], [T.VARCHAR, T.VARCHAR, T.VARCHAR, T.UBIGINT, T.UBIGINT, T.UBIGINT, T.INTEGER])
        indexed.add(key); changed.add(key); created++
        continue
      }
      // Without a row there is nothing to update: the key was never relevant or is already gone.
      if (!indexed.has(key)) continue
      if (decoded.eventName === 'EntityDeleted') {
        await store.remove([key], to)
        indexed.delete(key); changed.delete(key); removed++
        continue
      }
      if (decoded.eventName === 'EntityPatched') await run('UPDATE entities SET attrs_pending = true, updated_at = ? WHERE key = ?', [block, key], [T.UBIGINT, T.VARCHAR])
      else if (decoded.eventName === 'ExpiryExtended') await run('UPDATE entities SET expires_at = ?, updated_at = ? WHERE key = ?', [clampBlock(args.expiresAt!), block, key], [T.UBIGINT, T.UBIGINT, T.VARCHAR])
      // A transfer can move a key out of a filter ($owner); a non empty filter makes the filler recheck it.
      else if (decoded.eventName === 'OwnershipTransferred') await run('UPDATE entities SET owner = ?, updated_at = ?, attrs_pending = attrs_pending OR ? WHERE key = ?', [args.newOwner!.toLowerCase(), block, expression !== '', key], [T.VARCHAR, T.UBIGINT, T.BOOLEAN, T.VARCHAR])
      // Rows that wait again for attributes go to the front of the fill queue.
      if (decoded.eventName === 'EntityPatched' || (decoded.eventName === 'OwnershipTransferred' && expression)) await run('DELETE FROM fill_misses WHERE key = ?', [key], [T.VARCHAR])
      changed.add(key); updated++
    }
    for (const key of changed) await run('INSERT INTO changes VALUES (?, ?, ?)', [to, key, false], [T.UBIGINT, T.VARCHAR, T.BOOLEAN])
    const expired = await store.sweepExpired(to)
    if (await rpc.blockHash(to) !== targetHash) throw Error('Canonical header changed during batch')
    await store.setState({ head_block: to, head_hash: targetHash })
    return { created, updated, removed: removed + expired }
  })
}

export async function syncBatch(rpc: ArkivRpc, store: Store, expression: string, from: number, to: number, queryRpc: ArkivRpc = rpc): Promise<{ queried: number; upserted: number; removed: number }> {
  const targetHash = await rpc.blockHash(to)
  const all = await batchLogs(rpc, from, to)
  const { keys, createdBy } = touchedFromLogs(all), indexed = await store.indexedKeys()
  const terms = ownerTerms(expression), owners = new Set([...terms.creators, ...terms.owners])
  const relevant = keys.filter(k => indexed.has(k) || owners.size === 0 || owners.has(createdBy.get(k)!))
  const queries = keyChunkQueries(expression || null, relevant)
  return store.transaction(async () => {
    const returned = new Set<string>()
    let upserted = 0
    for (const query of queries) {
      let cursor: string | undefined
      do {
        const page = await queryRpc.query(query, { atBlock: to, limit: 200, select: ROW_SELECT, cursor })
        if (page.blockNumber !== to) throw Error('Snapshot block mismatch')
        const rows = page.data.map(decodeEntity)
        for (const row of rows) returned.add(row.entity.key)
        await store.upsert(rows, to); upserted += rows.length; cursor = page.cursor
      } while (cursor)
    }
    const removed = relevant.filter(k => indexed.has(k) && !returned.has(k))
    await store.remove(removed, to)
    const expired = await store.sweepExpired(to)
    if (await rpc.blockHash(to) !== targetHash) throw Error('Canonical header changed during batch')
    await store.setState({ head_block: to, head_hash: targetHash })
    return { queried: queries.length, upserted, removed: removed.length + expired }
  })
}
