import * as T from '@duckdb/node-api'
import { clampBlock, ENTITY_EVENTS_ABI, decodeEventLog, RpcError, type ArkivRpc, type RawLog } from '@asi/core'
import type { Store } from './store'

export async function fetchLogsAdaptive(rpc: ArkivRpc, from: number, to: number, onWindow: (logs: RawLog[], from: number, to: number) => Promise<void>, opts: { window?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<void> {
  let window = opts.window ?? 20000
  if (!Number.isSafeInteger(window) || window < 1) throw Error('Invalid log window')
  const sleep = opts.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  let start = from, end = Math.min(to, from + window - 1)
  while (start <= to) {
    let logs: RawLog[]
    try { logs = await rpc.getLogs(start, end) }
    catch (error) {
      if (error instanceof RpcError && error.status === 429) {
        const seconds = Number(error.retryAfter)
        const delay = error.retryAfter === null ? 1000 : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(error.retryAfter) - Date.now()
        await sleep(Number.isFinite(delay) ? Math.max(0, delay) : 1000)
        continue
      }
      if (!(error instanceof RpcError && error.code === -32602 && /max results/i.test(error.message)) || start === end) throw error
      const range = /retry with the range\s+(\d+)-(\d+)/i.exec(error.message)
      if (range && Number(range[1]) === start && Number(range[2]) >= start && Number(range[2]) < end) end = Number(range[2])
      else end = start + Math.floor((end - start + 1) / 2) - 1
      window = end - start + 1
      continue
    }
    await onWindow(logs, start, end)
    start = end + 1
    end = Math.min(to, start + window - 1)
  }
}

export async function replayTarget(store: Store): Promise<number | null> {
  const exists = (await store.conn.runAndReadAll("SELECT 1 FROM information_schema.tables WHERE table_name = 'replay_target'")).getRowObjects().length
  if (!exists) return null
  const row = (await store.conn.runAndReadAll('SELECT block FROM replay_target')).getRowObjects()[0]
  return row ? Number(row.block) : null
}
export async function clearReplay(store: Store): Promise<void> {
  await store.conn.run('DROP TABLE IF EXISTS replay_events; DROP TABLE IF EXISTS replay_state; DROP TABLE IF EXISTS replay_live; DROP TABLE IF EXISTS replay_target; DROP TABLE IF EXISTS replay_fetched; DROP TABLE IF EXISTS replay_detail_state')
}

function decodeReplayLog(entry: RawLog): { key: string; kind: string; expiresAt: number | null; owner: string | null; flags: number | null } {
  const decoded = decodeEventLog({ abi: ENTITY_EVENTS_ABI, topics: entry.topics as [`0x${string}`, ...`0x${string}`[]], data: entry.data as `0x${string}` })
  const args = decoded.args as { entityKey: string; owner?: string; newOwner?: string; expiresAt?: bigint; creationFlags?: number }
  // owner holds the owner after the event: the creator for EntityCreated, the new owner after a transfer.
  const owner = decoded.eventName === 'EntityCreated' ? args.owner! : decoded.eventName === 'OwnershipTransferred' ? args.newOwner! : null
  return {
    key: args.entityKey.toLowerCase(), kind: decoded.eventName,
    expiresAt: args.expiresAt === undefined ? null : clampBlock(args.expiresAt),
    owner: owner === null ? null : owner.toLowerCase(),
    flags: decoded.eventName === 'EntityCreated' ? Number(args.creationFlags) : null,
  }
}

async function tableExists(store: Store, name: string): Promise<boolean> {
  return (await store.conn.runAndReadAll('SELECT 1 FROM information_schema.tables WHERE table_name = ?', [name])).getRowObjects().length > 0
}

// Replay tables from before owner capture gain the columns plus a detail pass that refills them from block 0.
async function migrateReplay(store: Store): Promise<void> {
  if (!await tableExists(store, 'replay_events')) return
  const hasOwner = (await store.conn.runAndReadAll("SELECT 1 FROM information_schema.columns WHERE table_name = 'replay_events' AND column_name = 'owner'")).getRowObjects().length
  if (hasOwner) return
  await store.transaction(async () => {
    await store.conn.run('ALTER TABLE replay_events ADD COLUMN owner VARCHAR')
    await store.conn.run('ALTER TABLE replay_events ADD COLUMN flags INTEGER')
    await store.conn.run('CREATE TABLE replay_detail_state(next_block UBIGINT); INSERT INTO replay_detail_state VALUES (0)')
  })
}

export async function replayDetails(rpc: ArkivRpc, store: Store, toBlock: number, log: (msg: string) => void = () => {}, opts: { window?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<void> {
  await migrateReplay(store)
  if (!await tableExists(store, 'replay_detail_state')) return
  const from = Number((await store.conn.runAndReadAll('SELECT next_block FROM replay_detail_state')).getRowObjects()[0]!.next_block)
  if (from > toBlock) return
  const live = await tableExists(store, 'replay_live') ? new Set((await store.conn.runAndReadAll('SELECT key FROM replay_live')).getRowObjects().map(row => String(row.key))) : null
  await fetchLogsAdaptive(rpc, from, toBlock, async (logs, _from, to) => {
    await store.transaction(async () => {
      for (const entry of logs) {
        const event = decodeReplayLog(entry)
        if (event.owner === null || (live && !live.has(event.key))) continue
        await store.conn.run('UPDATE replay_events SET owner = ?, flags = ? WHERE block = ? AND log_index = ?', [event.owner, event.flags, entry.blockNumber, entry.logIndex], [T.VARCHAR, T.INTEGER, T.UBIGINT, T.INTEGER])
      }
      await store.conn.run('UPDATE replay_detail_state SET next_block = ?', [to + 1], [T.UBIGINT])
    })
    log('Replayed owner details through block ' + to)
  }, opts)
}

// Inserts a pending row for every live key without a fetched row. Returns the number of rows written.
export async function writeLogRows(store: Store, toBlock: number): Promise<number> {
  return store.transaction(async () => {
    const before = Number((await store.conn.runAndReadAll('SELECT count(*) AS n FROM entities')).getRowObjects()[0]!.n)
    await store.conn.run(`INSERT INTO entities (key, owner, creator, created_at, updated_at, expires_at, content_type, creation_flags, attrs_pending)
      SELECT key,
        first(owner ORDER BY block DESC, log_index DESC) FILTER (WHERE owner IS NOT NULL),
        first(owner ORDER BY block DESC, log_index DESC) FILTER (WHERE kind = 'EntityCreated'),
        max(block) FILTER (WHERE kind = 'EntityCreated'),
        max(block),
        first(expires_at ORDER BY block DESC, log_index DESC) FILTER (WHERE expires_at IS NOT NULL),
        NULL,
        coalesce(first(flags ORDER BY block DESC, log_index DESC) FILTER (WHERE kind = 'EntityCreated'), 0),
        true
      FROM replay_events
      WHERE block <= ? AND key IN (SELECT key FROM replay_live) AND key NOT IN (SELECT key FROM entities)
      GROUP BY key`, [toBlock], [T.UBIGINT])
    return Number((await store.conn.runAndReadAll('SELECT count(*) AS n FROM entities')).getRowObjects()[0]!.n) - before
  })
}

export async function replayLiveKeys(rpc: ArkivRpc, store: Store, toBlock: number, log: (msg: string) => void = () => {}): Promise<string[]> {
  const target = await replayTarget(store)
  if (target !== null && target !== toBlock) await store.transaction(async () => {
    await clearReplay(store)
    await store.conn.run('DELETE FROM attributes; DELETE FROM entities; DELETE FROM changes')
  })
  const completed = (await store.conn.runAndReadAll("SELECT 1 FROM information_schema.tables WHERE table_name = 'replay_live'")).getRowObjects().length
  if (completed) return (await store.conn.runAndReadAll('SELECT key FROM replay_live ORDER BY key')).getRowObjects().map(row => String(row.key))
  await migrateReplay(store)
  await store.conn.run('CREATE TABLE IF NOT EXISTS replay_target(block UBIGINT); CREATE TABLE IF NOT EXISTS replay_events(key VARCHAR, kind VARCHAR, block UBIGINT, log_index INTEGER, expires_at UBIGINT, owner VARCHAR, flags INTEGER, PRIMARY KEY(block, log_index)); CREATE TABLE IF NOT EXISTS replay_state(next_block UBIGINT)')
  if (await replayTarget(store) === null) await store.conn.run('INSERT INTO replay_target VALUES (?)', [toBlock], [T.UBIGINT])
  const state = (await store.conn.runAndReadAll('SELECT next_block FROM replay_state')).getRowObjects()[0]
  const from = state ? Number(state.next_block) : 0
  await fetchLogsAdaptive(rpc, from, toBlock, async (logs, _from, to) => {
    await store.transaction(async () => {
      for (const entry of logs) {
        const event = decodeReplayLog(entry)
        await store.conn.run('INSERT OR IGNORE INTO replay_events (key, kind, block, log_index, expires_at, owner, flags) VALUES (?, ?, ?, ?, ?, ?, ?)', [event.key, event.kind, entry.blockNumber, entry.logIndex, event.expiresAt, event.owner, event.flags], [T.VARCHAR, T.VARCHAR, T.UBIGINT, T.INTEGER, T.UBIGINT, T.VARCHAR, T.INTEGER])
      }
      await store.conn.run('DELETE FROM replay_state')
      await store.conn.run('INSERT INTO replay_state VALUES (?)', [to + 1], [T.UBIGINT])
    })
    log('Replayed logs through block ' + to)
  })
  await store.transaction(async () => {
    await store.conn.run('CREATE TABLE replay_live(key VARCHAR PRIMARY KEY)')
    await store.conn.run(`INSERT INTO replay_live
    SELECT key FROM replay_events WHERE block <= ?
    GROUP BY key
    HAVING count(*) FILTER (WHERE kind = 'EntityCreated') > 0
      AND first(kind ORDER BY block DESC, log_index DESC) <> 'EntityDeleted'
      AND first(expires_at ORDER BY block DESC, log_index DESC) FILTER (WHERE expires_at IS NOT NULL) > ?
    ORDER BY key`, [toBlock, toBlock], [T.UBIGINT, T.UBIGINT])
  })
  return (await store.conn.runAndReadAll('SELECT key FROM replay_live ORDER BY key')).getRowObjects().map(row => String(row.key))
}
