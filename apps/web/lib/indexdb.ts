import { RAW_TABLES_SQL, MERGE_VIEWS_SQL, setHeadSql, loadSnapshotSql, type Delta, type Manifest } from '@asi/core'
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'
import { createBrowserRpc } from './rpc-browser'

const clears = ['DELETE FROM delta_entities', 'DELETE FROM delta_attributes', 'DELETE FROM delta_tombstones']
const literal = (value: string | number | null) => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + value.replaceAll("'", "''") + "'"

export function applyDeltaSql(delta: Delta): string[] {
  const sql = [...clears]
  const insert = (table: string, rows: (string | number | null)[][]) => {
    if (rows.length) sql.push('INSERT INTO ' + table + ' VALUES ' + rows.map(row => '(' + row.map(literal).join(', ') + ')').join(', '))
  }
  insert('delta_entities', delta.entities.map(e => [e.key, e.owner, e.creator, e.created_at, e.updated_at, e.expires_at, e.content_type, e.creation_flags]))
  insert('delta_attributes', delta.attributes.map(a => [a.key, a.name, a.type, a.value, a.num]))
  insert('delta_tombstones', delta.tombstones.map(t => [t.key, t.block]))
  return sql
}

export function chainCheck(m: Manifest, chainId: number, genesisHash: string): { ok: boolean; reason?: string } {
  if (m.chainId !== chainId) return { ok: false, reason: 'chain ID mismatch' }
  if (m.genesisHash.toLowerCase() !== genesisHash.toLowerCase()) return { ok: false, reason: 'genesis hash mismatch' }
  return { ok: true }
}

export type IndexState = {
  status: 'loading' | 'ready' | 'error'; error?: string; manifest?: Manifest
  deltaTo?: number; liveHead?: number; chainOk?: boolean
}

export class IndexDb {
  private state: IndexState = { status: 'loading' }
  private listener?: (s: IndexState) => void
  private timer?: ReturnType<typeof setTimeout>
  private generation = 0
  private queue: Promise<unknown> = Promise.resolve()
  private etag: string | null = null
  private manifestAt = 0
  private rpc: ReturnType<typeof createBrowserRpc>

  private constructor(private origin: string, rpcUrl: string, private connection: AsyncDuckDBConnection, private queries: AsyncDuckDBConnection) {
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
      return new IndexDb(origin.replace(/\/$/, ''), rpcUrl, connection, await db.connect())
    } catch (error) {
      worker.terminate()
      throw error
    } finally {
      URL.revokeObjectURL(workerUrl)
    }
  }

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
      response = await fetch(this.origin + '/data/' + path, { cache: 'no-store', headers })
    } catch {
      throw new Error('indexer unavailable')
    }
    if (!response.ok && response.status !== 304) throw new Error('indexer unavailable (HTTP ' + response.status + ')')
    return response
  }

  private async poll() {
    if (!this.state.manifest || Date.now() - this.manifestAt >= 10_000) {
      const manifest: Manifest = await (await this.data('manifest.json')).json()
      const [chain, genesis] = await Promise.all([this.rpc.chainId(), this.rpc.genesisHash()])
      const check = chainCheck(manifest, chain, genesis)
      if (this.state.manifest?.version !== manifest.version) {
        await this.transaction([...loadSnapshotSql(this.origin + '/data/' + manifest.files.entities, this.origin + '/data/' + manifest.files.attributes), ...clears])
        this.etag = null
        this.state = { ...this.state, deltaTo: undefined }
      }
      this.state = { ...this.state, manifest, chainOk: check.ok, error: check.reason }
      this.manifestAt = Date.now()
    }
    const response = await this.data('delta.json', this.etag ? { 'If-None-Match': this.etag } : undefined)
    if (response.status !== 304) {
      const delta: Delta = await response.json()
      // A snapshot and its matching delta may be published between requests.
      // Retry the manifest before applying a delta from a different snapshot.
      if (delta.fromBlock !== this.state.manifest!.snapshotBlock + 1) {
        this.manifestAt = 0
        return
      }
      await this.transaction(applyDeltaSql(delta))
      this.etag = response.headers.get('etag')
      this.state = { ...this.state, deltaTo: delta.toBlock }
    }
    const liveHead = await this.rpc.blockNumber()
    await this.transaction(setHeadSql(liveHead))
    this.state = { ...this.state, status: 'ready', liveHead, error: this.state.chainOk ? undefined : this.state.error }
  }

  start(onState: (s: IndexState) => void): void {
    this.stop()
    this.listener = onState
    const generation = this.generation
    onState(this.state)
    const tick = async () => {
      await this.serial(async () => {
        if (generation !== this.generation) return
        try { await this.poll() } catch (error) {
          this.state = { ...this.state, status: 'error', error: error instanceof Error ? error.message : String(error) }
        }
        if (generation === this.generation) this.listener?.({ ...this.state })
      })
      if (generation === this.generation) this.timer = setTimeout(tick, 2000)
    }
    void tick()
  }

  stop(): void {
    this.generation++
    clearTimeout(this.timer)
    this.listener = undefined
  }

  run(sql: string, maxRows = 1000): Promise<{ columns: string[]; rows: unknown[][]; truncated: boolean }> {
    return this.serial(async () => {
      const reader = await this.queries.send(sql, true)
      const columns = reader.schema.fields.map(field => field.name)
      const rows: unknown[][] = []
      try {
        for await (const batch of reader) {
          for (let i = 0; i < batch.numRows; i++) {
            if (rows.length === maxRows) {
              await this.cancel()
              return { columns, rows, truncated: true }
            }
            rows.push(columns.map((_, j) => batch.getChildAt(j)?.get(i)))
          }
        }
        return { columns, rows, truncated: false }
      } finally {
        await reader.cancel()
      }
    })
  }

  async cancel(): Promise<void> { await this.queries.cancelSent() }

  schema(): Promise<Record<string, string[]>> {
    return this.serial(async () => {
      const table = await this.connection.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('entities', 'attributes') ORDER BY table_name, ordinal_position")
      const result: Record<string, string[]> = { entities: [], attributes: [] }
      for (const row of table) result[String(row.table_name)].push(String(row.column_name))
      return result
    })
  }
}
