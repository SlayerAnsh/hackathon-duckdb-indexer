import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'bun:test'
import type { ArkivRpc, EntityRow, RpcEntity } from '@asi/core'
import type { Store } from '../src/store'
export const hash = '0x95488063112df36be71b4700200a1b18e2578317853f9d82af5c3da313a5ab71'
export const expression = '$creator = addr(0x1234)'
const dirs: string[] = [], stores: Store[] = []
export async function temp() { const dir = await mkdtemp(join(tmpdir(), 'asi-')); dirs.push(dir); return dir }
export function track(store: Store) { stores.push(store); return store }
afterEach(async () => { for (const s of stores.splice(0)) s.close(); for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }) })
export function row(key = '0x01', expires_at = 200) {
  const entity: EntityRow = { key, owner: '0x02', creator: '0x02', created_at: 1, updated_at: 2, expires_at, content_type: null, creation_flags: 0 }
  return { entity, attributes: [{ key, name: 'type', type: 'str' as const, value: "ticket's", num: null }] }
}
export function raw(key = '0x01'): RpcEntity {
  return { key, owner: '0x02', creator: '0x02', createdAt: '0x1', updatedAt: '0x2', expiresAt: '0xc8', creationFlags: { raw: 0, readonly: false, permissionlessExtension: false }, attributes: [] } as RpcEntity
}
export function fake(query: ArkivRpc['query']): ArkivRpc {
  return { blockHash: async () => hash, query, blockNumber: async () => 103, chainId: async () => 7738577, genesisHash: async () => hash, getLogs: async () => [] }
}
export async function rows(store: Store, sql: string) { return (await store.conn.runAndReadAll(sql)).getRowObjects() }
