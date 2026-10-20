import { ENTITY_INSERT_COLUMNS, LIVE_TABLES, RAW_TABLES_SQL, MERGE_VIEWS_SQL, MATERIALIZE_SQL, setHeadSql, loadSnapshotSql, type Delta, type Manifest } from '@asi/core'
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'
import { LiveTail, type LiveStatus } from './live-tail'
import { createBrowserRpc } from './rpc-browser'
import { arrowTypeName, fieldConverter } from './arrow-value'

const clears = ['DELETE FROM delta_entities', 'DELETE FROM delta_attributes', 'DELETE FROM delta_tombstones']
const literal = (value: string | number | null) => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + value.replaceAll("'", "''") + "'"

export function applyDeltaSql(delta: Delta): string[] {
  const sql = [...clears]
  const insert = (table: string, rows: (string | number | null)[][], columns = '') => {
    if (rows.length) sql.push('INSERT INTO ' + table + columns + ' VALUES ' + rows.map(row => '(' + row.map(literal).join(', ') + ')').join(', '))
  }
  const pending = (e: Delta['entities'][number]) => e.attrs_pending ? 'true' : 'false'
  if (delta.entities.length) sql.push('INSERT INTO delta_entities (' + ENTITY_INSERT_COLUMNS + ', attrs_pending) VALUES ' + delta.entities
    .map(e => '(' + [e.key, e.owner, e.creator, e.created_at, e.updated_at, e.expires_at, e.content_type, e.creation_flags].map(literal).join(', ') + ', ' + pending(e) + ')').join(', '))
  insert('delta_attributes', delta.attributes.map(a => [a.key, a.name, a.type, a.value, a.num]))
  insert('delta_tombstones', delta.tombstones.map(t => [t.key, t.block]))
  return [...sql, ...MATERIALIZE_SQL]
}

export function chainCheck(m: Manifest, chainId: number, genesisHash: string): { ok: boolean; reason?: string } {
  if (m.chainId !== chainId) return { ok: false, reason: 'chain ID mismatch' }
  if (m.genesisHash.toLowerCase() !== genesisHash.toLowerCase()) return { ok: false, reason: 'genesis hash mismatch' }
  return { ok: true }
}

export type IndexState = {
  status: 'loading' | 'ready' | 'error'; error?: string; manifest?: Manifest
  liveTail?: LiveStatus; deltaTo?: number; liveHead?: number; chainOk?: boolean; source?: 'indexer' | 'disk'
}

/** How long a loaded snapshot is kept while newer versions are published and the live tail keeps it current. */
export const SNAPSHOT_MAX_AGE_MS = 10 * 60_000
/** A snapshot download fails when no bytes arrive for this long, or when it takes longer in total. */
export const DOWNLOAD_IDLE_MS = 20_000
export const DOWNLOAD_TOTAL_MS = 120_000

/**
 * Whether a published manifest needs a full snapshot reload. A new version is published every
 * 30 blocks (about a minute), and its delta only applies on top of that snapshot. While a loaded
 * snapshot is live tailed from the chain it stays correct, so it is replaced at most every `maxAgeMs`.
 */
export function snapshotPlan(o: { loadedVersion?: number; latestVersion: number; loadedAt: number; now: number; tailing: boolean; maxAgeMs?: number }): 'load' | 'keep' {
  if (o.loadedVersion === undefined) return 'load'
  if (o.loadedVersion === o.latestVersion) return 'keep'
  if (!o.tailing) return 'load'
  return o.now - o.loadedAt >= (o.maxAgeMs ?? SNAPSHOT_MAX_AGE_MS) ? 'load' : 'keep'
}

/** Downloads a whole file, failing on HTTP errors, on a stalled body (no bytes for `idleMs`) and after `totalMs`. */
export async function downloadBytes(url: string, o: { fetch?: typeof fetch; idleMs?: number; totalMs?: number; signal?: AbortSignal } = {}): Promise<Uint8Array> {
  const idleMs = o.idleMs ?? DOWNLOAD_IDLE_MS, totalMs = o.totalMs ?? DOWNLOAD_TOTAL_MS
  const controller = new AbortController()
  let reason = ''
  const abort = (why: string) => { if (!reason) { reason = why; controller.abort() } }
  const onAbort = () => abort('cancelled')
  if (o.signal?.aborted) onAbort(); else o.signal?.addEventListener('abort', onAbort, { once: true })
  const name = url.split('/').slice(-2).join('/')
  let idle = setTimeout(() => abort(`no data for ${idleMs / 1000}s`), idleMs)
  const total = setTimeout(() => abort(`not finished after ${totalMs / 1000}s`), totalMs)
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => abort(`no data for ${idleMs / 1000}s`), idleMs) }
  try {
    const response = await (o.fetch ?? fetch)(url, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    touch()
    if (!response.body) return new Uint8Array(await response.arrayBuffer())
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    const cancel = () => { void reader.cancel().catch(() => {}) }
    controller.signal.addEventListener('abort', cancel, { once: true })
    for (;;) {
      const { done, value } = await reader.read()
      if (reason) throw new Error(reason)
      if (done) break
      chunks.push(value); size += value.byteLength; touch()
    }
    const expected = Number(response.headers.get('content-length'))
    if (expected && expected !== size) throw new Error(`truncated (${size} of ${expected} bytes)`)
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return bytes
  } catch (error) {
    const detail = reason || (error instanceof Error ? error.message : String(error))
    throw new Error(`snapshot download failed: ${name}: ${detail}`)
  } finally {
    clearTimeout(idle); clearTimeout(total)
    o.signal?.removeEventListener('abort', onAbort)
  }
}

export class QueryCancelled extends Error { constructor() { super('Query cancelled'); this.name = 'QueryCancelled' } }
export class IndexUnavailable extends Error { constructor(detail: string) { super(detail); this.name = 'IndexUnavailable' } }

/** Lets queries wait for the first loaded snapshot. Waiters fail when loading fails or their signal aborts. */
export class ReadyGate {
  private waiters = new Set<{ resolve: () => void; reject: (e: Error) => void }>()
  ready = false
  update(o: { ready: boolean; error?: string }): void {
    this.ready = o.ready
    if (!o.ready && o.error === undefined) return
    for (const waiter of [...this.waiters]) o.ready ? waiter.resolve() : waiter.reject(new IndexUnavailable(o.error!))
    this.waiters.clear()
  }
  wait(signal?: AbortSignal): Promise<void> {
    if (this.ready) return Promise.resolve()
    if (signal?.aborted) return Promise.reject(new QueryCancelled())
    return new Promise((resolve, reject) => {
      const onAbort = () => { this.waiters.delete(waiter); reject(new QueryCancelled()) }
      const waiter = {
        resolve: () => { signal?.removeEventListener('abort', onAbort); resolve() },
        reject: (e: Error) => { signal?.removeEventListener('abort', onAbort); reject(e) },
      }
      this.waiters.add(waiter)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}

export type RunOptions = { signal?: AbortSignal; onWaiting?: () => void; onRunning?: () => void }
type Snapshot = { manifest: Manifest; entities: Uint8Array; attributes: Uint8Array; delta?: { body: Delta; etag: string | null } }

export class IndexDb {
  private state: IndexState = { status: 'loading' }
  private listener?: (s: IndexState) => void
  private timer?: ReturnType<typeof setTimeout>
  private generation = 0
  private abort?: AbortController
  private queue: Promise<unknown> = Promise.resolve()
  private tail?: LiveTail
  private etag: string | null = null
  private manifestAt = 0
  private loadedAt = 0
  /** Version of the newest published manifest, which may be ahead of the loaded one. */
  private latest?: number
  private chain?: { id: number; genesis: string }
  private gate = new ReadyGate()
  private rpc: ReturnType<typeof createBrowserRpc>

  private constructor(private origin: string, private rpcUrl: string, private duck: AsyncDuckDB, private connection: AsyncDuckDBConnection, private queries: AsyncDuckDBConnection) {
    this.rpc = createBrowserRpc(rpcUrl)
  }

  static async create(origin: string, rpcUrl: string): Promise<IndexDb> {
    const duckdb = await import('@duckdb/duckdb-wasm')
    const bundles = duckdb.getJsDelivrBundles()
    const bundle = await duckdb.selectBundle({ mvp: bundles.mvp, eh: bundles.eh })
    const workerUrl = URL.createObjectURL(new Blob(['importScripts(' + JSON.stringify(bundle.mainWorker) + ');'], { type: 'text/javascript' }))
    const worker = new Worker(workerUrl)
    try {
      const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker)
      await db.instantiate(bundle.mainModule)
      const connection = await db.connect()
      for (const sql of [...RAW_TABLES_SQL, ...MERGE_VIEWS_SQL]) await connection.query(sql)
      return new IndexDb(origin.replace(/\/$/, ''), rpcUrl, db, connection, await db.connect())
    } catch (error) {
      worker.terminate()
      throw error
    } finally {
      URL.revokeObjectURL(workerUrl)
    }
  }

  /** DuckDB work only. Network requests stay outside so a slow download never blocks a query. */
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work)
    this.queue = result.catch(() => {})
    return result
  }

  private async transaction(sql: string[]) {
    await this.connection.query('BEGIN TRANSACTION')
    try {
      for (const statement of sql) await this.connection.query(statement)
      await this.connection.query('COMMIT')
    } catch (error) {
      await this.connection.query('ROLLBACK')
      throw error
    }
  }

  private async data(path: string, headers?: HeadersInit) {
    let response: Response
    try {
      response = await fetch(this.origin + '/data/' + path, { cache: 'no-store', headers, signal: this.abort?.signal })
    } catch {
      throw new Error('indexer unavailable')
    }
    if (!response.ok && response.status !== 304) {
      const body = response.status === 503 ? await response.json().catch(() => null) as { error?: unknown } | null : null
      throw new Error(typeof body?.error === 'string' ? body.error : 'indexer unavailable (HTTP ' + response.status + ')')
    }
    return response
  }

  /** Fetches both snapshot files and the matching delta without holding the DuckDB lock. */
  private async download(manifest: Manifest): Promise<Snapshot> {
    const url = (path: string) => this.origin + '/data/' + path
    const [entities, attributes] = await Promise.all([manifest.files.entities, manifest.files.attributes].map(path => downloadBytes(url(path), { signal: this.abort?.signal })))
    const response = await this.data('delta.json')
    const body: Delta | undefined = response.status === 304 ? undefined : await response.json()
    // A delta from a newer snapshot cannot be applied; the next poll fetches the matching one.
    const delta = body?.fromBlock === manifest.snapshotBlock + 1 ? { body, etag: response.headers.get('etag') } : undefined
    return { manifest, entities: entities!, attributes: attributes!, delta }
  }

  /** Swaps in a downloaded snapshot and its delta in one transaction, so queries never see half of it. */
  private async install(snapshot: Snapshot, live: () => boolean) {
    const names = [`snap-v${snapshot.manifest.version}-entities.parquet`, `snap-v${snapshot.manifest.version}-attributes.parquet`] as const
    const installed = await this.serial(async () => {
      if (!live()) return false
      this.tail?.stop(); this.tail = undefined
      await this.duck.registerFileBuffer(names[0], snapshot.entities)
      await this.duck.registerFileBuffer(names[1], snapshot.attributes)
      try {
        await this.transaction([...loadSnapshotSql(names[0], names[1]), ...clears, ...LIVE_TABLES.map(table => `DELETE FROM ${table}`),
          ...(snapshot.delta ? applyDeltaSql(snapshot.delta.body) : MATERIALIZE_SQL)])
      } finally {
        for (const name of names) await this.duck.dropFile(name).catch(() => null)
      }
      return true
    })
    if (!installed) return
    this.etag = snapshot.delta?.etag ?? null
    this.loadedAt = this.now()
    this.state = { ...this.state, manifest: snapshot.manifest, deltaTo: snapshot.delta?.body.toBlock }
  }

  private async poll(live: () => boolean) {
    if (!this.state.manifest || this.now() - this.manifestAt >= 10_000) {
      const manifestResponse = await this.data('manifest.json')
      const source = manifestResponse.headers.get('x-served-by') === 'disk' ? 'disk' : 'indexer'
      const manifest: Manifest = await manifestResponse.json()
      if (!this.chain) { const [id, genesis] = await Promise.all([this.rpc.chainId(), this.rpc.genesisHash()]); this.chain = { id, genesis } }
      const check = chainCheck(manifest, this.chain.id, this.chain.genesis)
      const plan = snapshotPlan({ loadedVersion: this.state.manifest?.version, latestVersion: manifest.version, loadedAt: this.loadedAt, now: this.now(), tailing: !!this.tail })
      if (plan === 'load') {
        let snapshot: Snapshot | undefined
        try { snapshot = await this.download(manifest) } catch (error) {
          // A failed background refresh keeps serving the loaded, live tailed snapshot and retries later.
          if (!this.state.manifest || !live()) throw error
          console.warn(error instanceof Error ? error.message : error)
        }
        if (!live()) return
        if (snapshot) await this.install(snapshot, live)
      }
      if (!live()) return
      this.state = { ...this.state, source, chainOk: check.ok, error: check.reason }
      this.manifestAt = this.now()
      this.latest = manifest.version
    }
    // The published delta applies only to the newest snapshot; a kept older one is current through the live tail.
    if (this.state.manifest!.version === this.latest) {
      const response = await this.data('delta.json', this.etag ? { 'If-None-Match': this.etag } : undefined)
      if (response.status !== 304) {
        const delta: Delta = await response.json()
        // A snapshot and its matching delta may be published between requests.
        // Retry the manifest before applying a delta from a different snapshot.
        if (delta.fromBlock !== this.state.manifest!.snapshotBlock + 1) {
          this.manifestAt = 0
        } else {
          await this.serial(async () => { if (live()) await this.transaction(applyDeltaSql(delta)) })
          if (!live()) return
          this.etag = response.headers.get('etag')
          this.state = { ...this.state, deltaTo: delta.toBlock }
        }
      }
    }
    if (!this.tail && this.state.chainOk && this.state.deltaTo !== undefined) {
      const tail = new LiveTail({
        rpcUrl: this.rpcUrl, expression: this.state.manifest!.expression,
        apply: sql => this.serial(async () => { if (this.tail === tail) await this.transaction(sql) }),
        known: key => this.serial(async () => {
          const result = await this.connection.query("SELECT * FROM entities WHERE key = " + literal(key))
          const row = result.toArray()[0]?.toJSON()
          if (!row) return undefined
          return { ...row, created_at: Number(row.created_at), updated_at: Number(row.updated_at), expires_at: Number(row.expires_at), creation_flags: Number(row.creation_flags) } as import('@asi/core').EntityRow
        }),
        onStatus: liveTail => { if (this.tail === tail) { this.state = { ...this.state, liveTail }; this.listener?.({ ...this.state }) } },
      })
      this.tail = tail
      tail.start(this.state.deltaTo + 1)
    }
    const liveHead = await this.rpc.blockNumber()
    await this.serial(async () => { if (live()) await this.transaction(setHeadSql(liveHead)) })
    if (!live()) return
    this.state = { ...this.state, status: 'ready', liveHead, error: this.state.chainOk ? undefined : this.state.error }
  }

  start(onState: (s: IndexState) => void): void {
    this.stop()
    this.listener = onState
    const generation = this.generation
    const abort = this.abort = new AbortController()
    const live = () => generation === this.generation
    onState(this.state)
    const tick = async () => {
      if (!live()) return
      try { await this.poll(live) } catch (error) {
        if (live()) this.state = { ...this.state, status: 'error', error: error instanceof Error ? error.message : String(error) }
      }
      if (!live()) return
      // Queries wait for the first snapshot; they fail instead of spinning when it cannot be loaded.
      this.gate.update({ ready: this.state.manifest !== undefined, error: this.state.status === 'error' ? this.state.error : undefined })
      this.listener?.({ ...this.state })
      if (!abort.signal.aborted) this.timer = setTimeout(tick, 2000)
    }
    void tick()
  }

  stop(): void {
    this.tail?.stop(); this.tail = undefined
    this.generation++
    this.abort?.abort()
    clearTimeout(this.timer)
    this.listener = undefined
  }

  run(sql: string, maxRows = 1000, options: RunOptions = {}): Promise<{ columns: string[]; types: string[]; rows: unknown[][]; truncated: boolean; elapsedMs: number }> {
    const { signal } = options
    const work = async () => {
      if (this.gate?.ready === false) { options.onWaiting?.(); await this.gate.wait(signal) }
      return this.serial(async () => {
        if (signal?.aborted) throw new QueryCancelled()
        options.onRunning?.()
        const start = performance.now()
        const reader = await this.queries.send(sql, true)
        // The Arrow stream exposes its schema only after the first message is read.
        await reader.open()
        const columns = reader.schema.fields.map(field => field.name)
        const types = reader.schema.fields.map(field => arrowTypeName(field.type))
        const convert = reader.schema.fields.map(field => fieldConverter(field.type as { typeId?: number; scale?: number }))
        const rows: unknown[][] = []
        try {
          for await (const batch of reader) {
            for (let i = 0; i < batch.numRows; i++) {
              if (rows.length === maxRows) {
                const elapsedMs = performance.now() - start
                await this.cancel()
                return { columns, types, rows, truncated: true, elapsedMs }
              }
              rows.push(columns.map((_, j) => convert[j]!(batch.getChildAt(j)?.get(i))))
            }
          }
          if (signal?.aborted) throw new QueryCancelled()
          return { columns, types, rows, truncated: false, elapsedMs: performance.now() - start }
        } finally {
          await reader.cancel()
        }
      })
    }
    if (!signal) return work()
    // A cancelled query settles at once, even while it still waits for the index or the lock.
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new QueryCancelled())
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort, { once: true })
      work().then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
    })
  }

  async cancel(): Promise<void> { await this.queries.cancelSent() }

  /** Clock for snapshot scheduling; tests replace it. */
  now(): number { return Date.now() }

  schema(): Promise<Record<string, string[]>> {
    return this.serial(async () => {
      const table = await this.connection.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('entities', 'attributes') ORDER BY table_name, ordinal_position")
      const result: Record<string, string[]> = { entities: [], attributes: [] }
      for (const row of table) result[String(row.table_name)].push(String(row.column_name))
      return result
    })
  }
}
