import type { AttrType, AttributeRow, EntityRow, RpcEntity } from './types'
export const BYTES_PREFIX = 32
export function decodeAttribute(key: string, a: { name: string; type: string; value: unknown }): AttributeRow {
  let value: string
  let num: number | null = null
  switch (a.type) {
    case 'u64': case 'u256':
      value = BigInt(a.value as string).toString(); num = Number(value); break
    case 'i32': case 'dec':
      value = String(a.value); num = Number(value); break
    case 'bool':
      value = a.value ? 'true' : 'false'; num = a.value ? 1 : 0; break
    case 'bytes': {
      // Blobs can reach 128 KiB; the index keeps a 32 byte hex prefix and the full length in num.
      const hex = String(a.value).toLowerCase()
      value = hex.slice(0, 2 + BYTES_PREFIX * 2); num = Math.max(0, (hex.length - 2) / 2); break
    }
    case 'addr': case 'key': case 'bytes32':
      value = String(a.value).toLowerCase(); break
    case 'str': value = String(a.value); break
    default: throw new Error(`Unsupported attribute type: ${a.type}`)
  }
  return { key: key.toLowerCase(), name: a.name, type: a.type as AttrType, value, num }
}
export function clampBlock(value: string | number | bigint): number {
  return Number(BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : value)
}
export function decodeEntity(e: RpcEntity): { entity: EntityRow; attributes: AttributeRow[] } {
  // ROW_SELECT supplies these fields; reject incomplete projections instead of inventing rows.
  if (e.key === undefined || e.owner === undefined || e.creator === undefined ||
      e.createdAt === undefined || e.updatedAt === undefined || e.expiresAt === undefined || e.creationFlags === undefined) {
    throw new Error('Entity is missing required row fields')
  }
  const entity: EntityRow = {
    key: e.key.toLowerCase(), owner: e.owner.toLowerCase(), creator: e.creator.toLowerCase(),
    created_at: clampBlock(e.createdAt), updated_at: clampBlock(e.updatedAt), expires_at: clampBlock(e.expiresAt),
    // Rabdi entities have no payload or content type; bytes attributes carry the data instead.
    content_type: null,
    creation_flags: typeof e.creationFlags === 'number' ? e.creationFlags : e.creationFlags.raw,
  }
  return { entity, attributes: (e.attributes ?? []).map(a => decodeAttribute(entity.key, a)) }
}
