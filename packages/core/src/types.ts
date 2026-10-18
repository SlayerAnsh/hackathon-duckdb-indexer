export type { RpcEntity } from '@arkiv-network/sdk/types'
export type AttrType = 'str' | 'i32' | 'u64' | 'u256' | 'dec' | 'bool' | 'addr' | 'key' | 'bytes32'
export type EntityRow = {
  key: string; owner: string; creator: string
  created_at: number; updated_at: number; expires_at: number
  content_type: string | null; creation_flags: number
}
export type AttributeRow = { key: string; name: string; type: AttrType; value: string; num: number | null }
export type Tombstone = { key: string; block: number }
export type Manifest = {
  chainId: number; genesisHash: string; expression: string
  version: number; snapshotBlock: number; headBlock: number
  files: { entities: string; attributes: string }; delta: string
}
export type Delta = {
  fromBlock: number; toBlock: number
  entities: EntityRow[]; attributes: AttributeRow[]; tombstones: Tombstone[]
}
