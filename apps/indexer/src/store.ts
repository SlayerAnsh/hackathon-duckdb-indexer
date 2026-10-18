import * as T from '@duckdb/node-api'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import type { EntityRow, AttributeRow } from '@asi/core'
export type SyncState = { chain_id: number; genesis_hash: string; expression: string; start_block: number; head_block: number; head_hash: string | null; snapshot_version: number; snapshot_block: number }
export class Store {
  private constructor(public conn: DuckDBConnection, private db: DuckDBInstance, private identity: Pick<SyncState, 'chain_id' | 'genesis_hash' | 'expression'>) {}
  static async open(dir: string, expression: string, chainId: number, genesisHash: string): Promise<Store> {
    expression = expression.trim()
    await mkdir(dir, { recursive: true })
    const db = await DuckDBInstance.create(join(dir, 'index.duckdb'))
    const conn = await db.connect()
    const store = new Store(conn, db, { chain_id: chainId, genesis_hash: genesisHash, expression })
    try {
      await conn.run(`CREATE TABLE IF NOT EXISTS entities (key VARCHAR PRIMARY KEY, owner VARCHAR, creator VARCHAR, created_at UBIGINT, updated_at UBIGINT, expires_at UBIGINT, content_type VARCHAR, creation_flags INTEGER);
        CREATE TABLE IF NOT EXISTS attributes (key VARCHAR, name VARCHAR, type VARCHAR, value VARCHAR, num DOUBLE, PRIMARY KEY(key,name));
        CREATE TABLE IF NOT EXISTS changes (block UBIGINT, key VARCHAR, deleted BOOLEAN);
        CREATE TABLE IF NOT EXISTS sync_state (chain_id UBIGINT, genesis_hash VARCHAR, expression VARCHAR, start_block UBIGINT, head_block UBIGINT, snapshot_version INTEGER, snapshot_block UBIGINT);
        CREATE TABLE IF NOT EXISTS store_identity (chain_id UBIGINT, genesis_hash VARCHAR, expression VARCHAR);`)
      await conn.run('ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS head_hash VARCHAR')
      // Rows written from log data wait for their attributes; fetched rows are never pending.
      await conn.run('ALTER TABLE entities ADD COLUMN IF NOT EXISTS attrs_pending BOOLEAN DEFAULT false')
      const saved = (await conn.runAndReadAll('SELECT * FROM store_identity')).getRowObjects()[0]
      if (saved && saved.expression !== expression) throw Error(`Stored expression "${saved.expression}" differs from configured "${expression}" at ${dir}. Delete the store or restore the expression.`)
      if (saved && (Number(saved.chain_id) !== chainId || saved.genesis_hash !== genesisHash)) throw Error('Chain identity mismatch at ' + dir)
      if (!saved) await conn.run('INSERT INTO store_identity VALUES (?, ?, ?)', [chainId, genesisHash, expression], [T.UBIGINT, T.VARCHAR, T.VARCHAR])
      return store
    } catch (error) { store.close(); throw error }
  }
  async state(): Promise<SyncState | null> {
    const s = (await this.conn.runAndReadAll('SELECT * FROM sync_state')).getRowObjects()[0]
    if (!s) return null
    return { chain_id: Number(s.chain_id), genesis_hash: String(s.genesis_hash), expression: String(s.expression), start_block: Number(s.start_block), head_block: Number(s.head_block), head_hash: s.head_hash == null ? null : String(s.head_hash), snapshot_version: Number(s.snapshot_version), snapshot_block: Number(s.snapshot_block) }
  }
  async setState(partial: Partial<SyncState>): Promise<void> {
    const previous = await this.state()
    const state = { ...this.identity, start_block: 0, head_block: 0, head_hash: null, snapshot_version: 0, snapshot_block: 0, ...previous, ...partial }
    const values = [state.chain_id, state.genesis_hash, state.expression, state.start_block, state.head_block, state.snapshot_version, state.snapshot_block, state.head_hash]
    const types = [T.UBIGINT, T.VARCHAR, T.VARCHAR, T.UBIGINT, T.UBIGINT, T.INTEGER, T.UBIGINT, T.VARCHAR]
    if (previous) await this.conn.run('UPDATE sync_state SET chain_id = ?, genesis_hash = ?, expression = ?, start_block = ?, head_block = ?, snapshot_version = ?, snapshot_block = ?, head_hash = ?', values, types)
    else await this.conn.run('INSERT INTO sync_state (chain_id, genesis_hash, expression, start_block, head_block, snapshot_version, snapshot_block, head_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', values, types)
  }

  async upsert(rows: { entity: EntityRow; attributes: AttributeRow[] }[], changeBlock: number | null): Promise<void> {
    for (const { entity: e, attributes } of rows) {
      await this.conn.run('INSERT OR REPLACE INTO entities (key, owner, creator, created_at, updated_at, expires_at, content_type, creation_flags, attrs_pending) VALUES (?, ?, ?, ?, ?, ?, ?, ?, false)', [e.key, e.owner, e.creator, e.created_at, e.updated_at, e.expires_at, e.content_type, e.creation_flags], [T.VARCHAR, T.VARCHAR, T.VARCHAR, T.UBIGINT, T.UBIGINT, T.UBIGINT, T.VARCHAR, T.INTEGER])
      await this.conn.run('DELETE FROM attributes WHERE key = ?', [e.key])
      for (const a of attributes) await this.conn.run('INSERT INTO attributes VALUES (?, ?, ?, ?, ?)', [e.key, a.name, a.type, a.value, a.num], [T.VARCHAR, T.VARCHAR, T.VARCHAR, T.VARCHAR, T.DOUBLE])
      if (changeBlock !== null) await this.conn.run('INSERT INTO changes VALUES (?, ?, ?)', [changeBlock, e.key, false], [T.UBIGINT, T.VARCHAR, T.BOOLEAN])
    }
  }
  async remove(keys: string[], changeBlock: number): Promise<void> {
    for (const key of keys) {
      await this.conn.run('DELETE FROM attributes WHERE key = ?', [key])
      await this.conn.run('DELETE FROM entities WHERE key = ?', [key])
      await this.conn.run('INSERT INTO changes VALUES (?, ?, ?)', [changeBlock, key, true], [T.UBIGINT, T.VARCHAR, T.BOOLEAN])
    }
  }
  async indexedKeys(): Promise<Set<string>> {
    return new Set((await this.conn.runAndReadAll('SELECT key FROM entities')).getRowObjects().map(r => String(r.key)))
  }
  async sweepExpired(head: number): Promise<number> {
    const keys = (await this.conn.runAndReadAll('SELECT key FROM entities WHERE expires_at <= ?', [head], [T.UBIGINT])).getRowObjects().map(r => String(r.key))
    await this.remove(keys, head)
    return keys.length
  }
  async counts(head: number): Promise<{ live: number; pending: number }> {
    const row = (await this.conn.runAndReadAll('SELECT count(*) AS live, count(*) FILTER (WHERE attrs_pending) AS pending FROM entities WHERE expires_at > ?', [head], [T.UBIGINT])).getRowObjects()[0]!
    return { live: Number(row.live), pending: Number(row.pending) }
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.conn.run('BEGIN TRANSACTION')
    try { const result = await fn(); await this.conn.run('COMMIT'); return result }
    catch (error) { await this.conn.run('ROLLBACK').catch(() => {}); throw error } // DuckDB may have already ended the transaction; keep the original error
  }
  private closed = false
  get isClosed(): boolean { return this.closed }
  close(): void { if (this.closed) return; this.closed = true; this.conn.closeSync(); this.db.closeSync() }
}
