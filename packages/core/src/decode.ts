import type { AttrType, AttributeRow, EntityRow, RpcEntity } from './types'
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
    case 'addr': case 'key': case 'bytes32':
      value = String(a.value).toLowerCase(); break
    case 'str': value = String(a.value); break
    default: throw new Error(`Unsupported attribute type: ${a.type}`)
  }
  return { key: key.toLowerCase(), name: a.name, type: a.type as AttrType, value, num }
}
export function decodeEntity(e: RpcEntity): { entity: EntityRow; attributes: AttributeRow[] } {
  // ROW_SELECT supplies these fields; reject incomplete projections instead of inventing rows.
  if (e.key === undefined || e.owner === undefined || e.creator === undefined ||
      e.createdAt === undefined || e.updatedAt === undefined || e.expiresAt === undefined || e.creationFlags === undefined) {
    throw new Error('Entity is missing required row fields')
  }
  const entity: EntityRow = {
    key: e.key.toLowerCase(), owner: e.owner.toLowerCase(), creator: e.creator.toLowerCase(),
    created_at: Number(e.createdAt), updated_at: Number(e.updatedAt), expires_at: Number(e.expiresAt),
    content_type: e.contentType ?? null,
    creation_flags: typeof e.creationFlags === 'number' ? e.creationFlags : e.creationFlags.raw,
  }
  return { entity, attributes: (e.attributes ?? []).map(a => decodeAttribute(entity.key, a)) }
}
