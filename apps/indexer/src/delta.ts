import { writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { Delta, EntityRow, AttributeRow } from '@asi/core'
import type { Store } from './store'
export async function writeDelta(store: Store, dir: string): Promise<Delta> {
  const state = await store.state()
  if (!state) throw Error('Missing sync checkpoint')
  const delta: Delta = { fromBlock: state.snapshot_block + 1, toBlock: state.head_block, entities: [], attributes: [], tombstones: [] }
  const changes = (await store.conn.runAndReadAll(`SELECT key, block, deleted FROM changes WHERE block > ? QUALIFY row_number() OVER (PARTITION BY key ORDER BY block DESC, rowid DESC) = 1 ORDER BY key`, [state.snapshot_block])).getRowObjects()
  for (const change of changes) {
    const key = String(change.key)
    if (change.deleted) { delta.tombstones.push({ key, block: Number(change.block) }); continue }
    const row = (await store.conn.runAndReadAll('SELECT * FROM entities WHERE key = ?', [key])).getRowObjects()[0]
    if (!row) throw Error('Live change missing entity: ' + key)
    delta.entities.push({ ...row, created_at: Number(row.created_at), updated_at: Number(row.updated_at), expires_at: Number(row.expires_at), creation_flags: Number(row.creation_flags) } as EntityRow)
    delta.attributes.push(...(await store.conn.runAndReadAll('SELECT * FROM attributes WHERE key = ? ORDER BY name', [key])).getRowObjects() as AttributeRow[])
  }
  await writeFile(join(dir, 'delta.json.tmp'), JSON.stringify(delta))
  await rename(join(dir, 'delta.json.tmp'), join(dir, 'delta.json'))
  return delta
}
