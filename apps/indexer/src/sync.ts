import { ENTITY_EVENTS_ABI, decodeEventLog, decodeEntity, keyChunkQueries, ownerTerms, ROW_SELECT, RpcError, type ArkivRpc, type RawLog } from '@asi/core'
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
export async function syncBatch(rpc: ArkivRpc, store: Store, expression: string, from: number, to: number, queryRpc: ArkivRpc = rpc): Promise<{ queried: number; upserted: number; removed: number }> {
  async function logs(start: number, end: number): Promise<RawLog[]> {
    try { return await rpc.getLogs(start, end) }
    catch (error) {
      if (!(error instanceof RpcError && error.code === -32602 && /max results/i.test(error.message)) || start === end) throw error
      const mid = Math.floor((start + end) / 2)
      return [...await logs(start, mid), ...await logs(mid + 1, end)]
    }
  }
  const targetHash = await rpc.blockHash(to)
  const all: RawLog[] = []
  for (let start = from; start <= to; start += 1000) all.push(...await logs(start, Math.min(to, start + 999)))
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
