export type { RpcEntity } from '@arkiv-network/sdk/types'
export type AttrType = 'str' | 'i32' | 'u64' | 'u256' | 'dec' | 'bool' | 'addr' | 'key' | 'bytes32' | 'bytes'
export type EntityRow = {
  key: string; owner: string; creator: string
  created_at: number; updated_at: number; expires_at: number
  content_type: string | null; creation_flags: number
  attrs_pending?: boolean   // true for rows written from log data whose attributes are not fetched yet
}
export type AttributeRow = { key: string; name: string; type: AttrType; value: string; num: number | null }
export type Tombstone = { key: string; block: number }
/**
 * Version of the published data contract: the manifest fields and the entities/attributes Parquet
 * columns. Bumped only on a breaking change (a column or field removed, renamed or retyped, or a
 * meaning changed). Adding a column or an optional field keeps the version.
 */
export const SCHEMA_VERSION = 1
export type Manifest = {
  schemaVersion?: number   // absent in manifests published before versioning; read as 1
  chainId: number; genesisHash: string; expression: string
  version: number; snapshotBlock: number; headBlock: number
  files: { entities: string; attributes: string }; delta: string
  live?: number; pending?: number   // entity counts at headBlock; pending rows still wait for attributes
}
export type Delta = {
  fromBlock: number; toBlock: number
  entities: EntityRow[]; attributes: AttributeRow[]; tombstones: Tombstone[]
}
