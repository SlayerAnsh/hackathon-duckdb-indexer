import { DuckDBInstance } from '../../../packages/core/node_modules/@duckdb/node-api'

export type NativeRow = {
  key: string; creator: string; owner?: string; created_at?: number; updated_at?: number; expires_at?: number
  attrs_pending?: boolean; attrs: Record<string, string>
}
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

/** Plain public tables: callers supply only live rows, as the browser views do. */
export async function nativeDb(rows: NativeRow[]) {
  const instance = await DuckDBInstance.create(':memory:')
  const db = await instance.connect()
  try {
    await db.run(`CREATE TABLE entities (key VARCHAR PRIMARY KEY, owner VARCHAR, creator VARCHAR,
      created_at UBIGINT, updated_at UBIGINT, expires_at UBIGINT, content_type VARCHAR,
      creation_flags INTEGER, attrs_pending BOOLEAN DEFAULT false)`)
    await db.run('CREATE TABLE attributes (key VARCHAR, name VARCHAR, type VARCHAR, value VARCHAR, num DOUBLE, PRIMARY KEY (key, name))')
    for (const row of rows) {
      await db.run(`INSERT INTO entities VALUES (${quote(row.key)}, ${quote(row.owner ?? row.creator)}, ${quote(row.creator)},
        ${row.created_at ?? 1}, ${row.updated_at ?? 10}, ${row.expires_at ?? 100000}, 'application/json', 0, ${row.attrs_pending ?? false})`)
      for (const [name, value] of Object.entries(row.attrs)) {
        await db.run(`INSERT INTO attributes VALUES (${quote(row.key)}, ${quote(name)}, 'str', ${quote(value)}, NULL)`)
      }
    }
    return { db, close() { db.closeSync(); instance.closeSync() } }
  } catch (error) { db.closeSync(); instance.closeSync(); throw error }
}
