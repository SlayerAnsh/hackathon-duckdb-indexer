import * as T from '@duckdb/node-api'
import { clearReplay } from './replay'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Manifest } from '@asi/core'
import type { Store } from './store'
export async function readManifest(dir: string): Promise<Manifest | null> {
  try { return JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}
async function publishManifest(dir: string, manifest: Manifest): Promise<void> {
  await writeFile(join(dir, 'manifest.json.tmp'), JSON.stringify(manifest))
  await rename(join(dir, 'manifest.json.tmp'), join(dir, 'manifest.json'))
}
// Rewrites only the live and pending counts of the current manifest; the snapshot files stay the same.
export async function refreshManifestCounts(store: Store, dir: string): Promise<void> {
  const manifest = await readManifest(dir), state = await store.state()
  if (!manifest || !state) return
  await publishManifest(dir, { ...manifest, ...await store.counts(state.head_block) })
}
export async function writeSnapshot(store: Store, dir: string, head: number, meta: { chainId: number; genesisHash: string; expression: string }, keep: number): Promise<Manifest> {
  if (!Number.isSafeInteger(head) || head < 0) throw Error('Invalid snapshot head')
  if (!Number.isInteger(keep) || keep < 1) throw Error('keep must be positive')
  const previous = await readManifest(dir)
  const versions = await readdir(join(dir, 'snap')).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return []; throw error })
  // Skip orphan directories after a failed publication; published Parquet is immutable.
  const version = Math.max(previous?.version ?? 0, (await store.state())?.snapshot_version ?? 0, ...versions.filter(v => /^v\d+$/.test(v)).map(v => Number(v.slice(1)))) + 1
  const files = { entities: 'snap/v' + version + '/entities.parquet', attributes: 'snap/v' + version + '/attributes.parquet' }
  await mkdir(resolve(dir, 'snap/v' + version), { recursive: true })
  const quote = (path: string) => "'" + resolve(dir, path).replaceAll("'", "''") + "'"
  await store.conn.run(`COPY (SELECT * FROM entities WHERE expires_at > ${head}) TO ${quote(files.entities)} (FORMAT parquet)`)
  await store.conn.run(`COPY (SELECT a.* FROM attributes a JOIN entities e USING (key) WHERE e.expires_at > ${head}) TO ${quote(files.attributes)} (FORMAT parquet)`)
  const manifest: Manifest = { ...meta, version, snapshotBlock: head, headBlock: head, files, delta: 'delta.json', ...await store.counts(head) }
  await publishManifest(dir, manifest)
  await store.transaction(async () => {
    await store.conn.run('DELETE FROM changes WHERE block <= ?', [head], [T.UBIGINT])
    await store.setState({ snapshot_version: version, snapshot_block: head })
    await clearReplay(store)
  })
  const retained = [...versions, 'v' + version].filter(v => /^v\d+$/.test(v)).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))
  for (const old of retained.slice(keep)) await rm(join(dir, 'snap', old), { recursive: true, force: true })
  return manifest
}
