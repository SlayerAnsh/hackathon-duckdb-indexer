import { MATERIALIZE_SQL, ENTITY_EVENTS_ABI, ENTITY_INSERT_COLUMNS, decodeEventLog, createRpc, decodeEntity, keyChunkQueries, ownerTerms, ROW_SELECT, RpcError, type EntityRow, type RawLog } from '@asi/core'

export type LiveChange = { kind: 'upsert'; entity: Partial<EntityRow> & { key: string; updated_at: number }; needsAttributes: boolean } | { kind: 'tombstone'; key: string; block: number }
export type LiveStatus = { block: number; pending: number; budget: 'ok' | 'exhausted'; retryAt?: number }
const literal = (v: unknown): string => v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'"
const entityValues = (e: Partial<EntityRow>) => [e.key, e.owner, e.creator, e.created_at, e.updated_at, e.expires_at, e.content_type, e.creation_flags].map(literal).join(', ') + (e.attrs_pending ? ', true' : ', false')
function decode(log: RawLog) {
  return decodeEventLog({ abi: ENTITY_EVENTS_ABI, topics: log.topics as [`0x${string}`, ...`0x${string}`[]], data: log.data as `0x${string}` })
}
export function changesFromLogs(logs: RawLog[], known: (key: string) => EntityRow | undefined): LiveChange[] {
  const changes = new Map<string, LiveChange>()
  for (const log of [...logs].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)) {
    const event = decode(log), key = event.args.entityKey.toLowerCase()
    const previous = changes.get(key)
    const old = previous ? previous.kind === 'upsert' ? previous.entity : undefined : known(key)
    if (event.eventName === 'EntityDeleted') { changes.set(key, { kind: 'tombstone', key, block: log.blockNumber }); continue }
    let entity: Partial<EntityRow> & { key: string; updated_at: number }
    let needsAttributes = previous?.kind === 'upsert' && previous.needsAttributes
    if (event.eventName === 'EntityCreated') {
      entity = { key, owner: event.args.owner.toLowerCase(), creator: event.args.owner.toLowerCase(), created_at: log.blockNumber, updated_at: log.blockNumber, expires_at: Number(event.args.expiresAt), creation_flags: event.args.creationFlags, content_type: null }
      needsAttributes = true
    } else {
      if (!old) continue
      entity = { ...old, key, updated_at: log.blockNumber }
      if (event.eventName === 'EntityPatched') needsAttributes = true
      if (event.eventName === 'ExpiryExtended') entity.expires_at = Number(event.args.expiresAt)
      if (event.eventName === 'OwnershipTransferred') entity.owner = event.args.newOwner.toLowerCase()
    }
    changes.set(key, { kind: 'upsert', entity, needsAttributes })
  }
  return [...changes.values()]
}
type Options = { rpcUrl: string; expression: string; apply: (sql: string[]) => Promise<void>; known: (key: string) => Promise<EntityRow | undefined>; onStatus: (s: LiveStatus) => void; now?: () => number }
export class LiveTail {
  private rpc: ReturnType<typeof createRpc>
  private pending = new Set<string>()
  private block = 0
  private lastQuery = -Infinity
  private retryAt = 0
  private timer?: ReturnType<typeof setTimeout>
  private generation = 0
  private now: () => number
  constructor(private opts: Options) { this.rpc = createRpc(opts.rpcUrl); this.now = opts.now ?? Date.now }
  start(fromBlock: number): void {
    this.stop()
    this.block = fromBlock - 1
    const generation = this.generation
    const loop = async () => {
      try { await this.tick(undefined, generation) } catch { /* Preserve checkpoint and retry transient failures. */ }
      if (generation === this.generation) this.timer = setTimeout(loop, 4000)
    }
    void loop()
  }
  stop(): void { this.generation++; clearTimeout(this.timer) }
  async tick(fromBlock?: number, generation = this.generation): Promise<void> {
    if (fromBlock !== undefined) this.block = fromBlock - 1
    const active = () => generation === this.generation
    const head = await this.rpc.blockNumber()
    const terms = ownerTerms(this.opts.expression), owners = [...terms.creators, ...terms.owners]
    while (this.block < head && active()) {
      const end = Math.min(head, this.block + 1000)
      const logs = await this.rpc.getLogs(this.block + 1, end)
      const known = new Map<string, EntityRow>()
      const relevant = new Set<string>()
      for (const log of logs) {
        const event = decode(log), key = event.args.entityKey.toLowerCase()
        if (!known.has(key)) { const row = await this.opts.known(key); if (row) known.set(key, row) }
        if (!owners.length || known.has(key) || (event.eventName === 'EntityCreated' && owners.includes(event.args.owner.toLowerCase()))) relevant.add(key)
      }
      const changes = changesFromLogs(logs.filter(log => relevant.has(decode(log).args.entityKey.toLowerCase())), key => known.get(key))
      const sql: string[] = []
      // Capture every carried attribute set from the last committed merge before any raw writes.
      const carry = changes.flatMap(change => change.kind === 'upsert' && !change.needsAttributes && !this.pending.has(change.entity.key) ? [change.entity.key] : [])
      if (carry.length) sql.push(`CREATE OR REPLACE TEMP TABLE live_previous_attributes AS SELECT * FROM attributes WHERE key IN (${carry.map(literal).join(', ')})`)
      const pending = new Set(this.pending)
      for (const change of changes) {
        const key = change.kind === 'upsert' ? change.entity.key : change.key
        if (change.kind === 'upsert' && !change.needsAttributes && !this.pending.has(key)) {
          sql.push(
            `DELETE FROM live_attributes WHERE key = ${literal(key)}`,
            `INSERT INTO live_attributes SELECT * FROM live_previous_attributes WHERE key = ${literal(key)}`,
          )
        }
        for (const table of ['live_entities', 'live_tombstones']) sql.push(`DELETE FROM ${table} WHERE key = ${literal(key)}`)
        if (change.kind === 'tombstone') {
          sql.push(`INSERT INTO live_tombstones VALUES (${literal(key)}, ${change.block})`, `DELETE FROM live_attributes WHERE key = ${literal(key)}`, `DELETE FROM live_pending WHERE key = ${literal(key)}`)
          pending.delete(key)
        } else {
          sql.push(`INSERT INTO live_entities (${ENTITY_INSERT_COLUMNS}, attrs_pending) VALUES (${entityValues(change.entity)})`)
          if (change.needsAttributes) {
            pending.add(key)
            sql.push(`DELETE FROM live_pending WHERE key = ${literal(key)}`, `INSERT INTO live_pending VALUES (${literal(key)})`)
          }
        }
      }
      if (carry.length) sql.push('DROP TABLE live_previous_attributes')
      if (!active()) return
      if (sql.length) await this.opts.apply([...sql, ...MATERIALIZE_SQL])
      this.pending = pending; this.block = end
    }
    if (!active()) return
    const now = this.now()
    if (this.pending.size && now - this.lastQuery >= 20000 && now >= this.retryAt) {
      const keys = [...this.pending].slice(0, 50)
      this.lastQuery = now
      try {
        const page = await this.rpc.query(keyChunkQueries(this.opts.expression || null, keys)[0]!, { atBlock: head, select: ROW_SELECT, limit: 50 })
        if (!active()) return
        const rows = new Map(page.data.map(raw => { const row = decodeEntity(raw); return [row.entity.key, row] }))
        const sql: string[] = []
        for (const key of keys) {
          for (const table of ['live_entities', 'live_attributes', 'live_tombstones', 'live_pending']) sql.push(`DELETE FROM ${table} WHERE key = ${literal(key)}`)
          const row = rows.get(key)
          if (!row) sql.push(`INSERT INTO live_tombstones VALUES (${literal(key)}, ${head})`)
          else {
            sql.push(`INSERT INTO live_entities (${ENTITY_INSERT_COLUMNS}, attrs_pending) VALUES (${entityValues(row.entity)})`)
            for (const a of row.attributes) sql.push(`INSERT INTO live_attributes VALUES (${[a.key, a.name, a.type, a.value, a.num].map(literal).join(', ')})`)
          }
        }
        if (sql.length) await this.opts.apply([...sql, ...MATERIALIZE_SQL])
        keys.forEach(key => this.pending.delete(key)); this.retryAt = 0
      } catch (error) {
        if (!(error instanceof RpcError && error.status === 429)) throw error
        const seconds = Number(error.retryAfter)
        this.retryAt = now + (error.retryAfter && Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : Math.max(20000, Date.parse(error.retryAfter ?? '') - now || 3600000))
      }
    }
    if (active()) this.opts.onStatus({ block: this.block, pending: this.pending.size, budget: this.now() < this.retryAt ? 'exhausted' : 'ok', ...(this.now() < this.retryAt ? { retryAt: this.retryAt } : {}) })
  }
}
