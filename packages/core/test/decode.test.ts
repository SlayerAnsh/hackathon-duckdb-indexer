import { test, expect } from 'bun:test'
import { decodeEntity, decodeAttribute } from '../src/decode'
import type { RpcEntity } from '../src/types'
const fixture: RpcEntity = { key: '0x95fad865481db04f4ee45c83421546b3a1b8adbdccce650ec445d17c61f4cd23', owner: '0x679b5ab1cd4b488d73025d0d72d4017fa2d97b59', creator: '0x679b5ab1cd4b488d73025d0d72d4017fa2d97b59', createdAt: '0xb55f4', updatedAt: '0xb55f4', expiresAt: '0xb5978', creationFlags: { readonly: false, permissionlessExtension: false, raw: 0 }, contentType: 'application/octet-stream', attributes: [{ name: 'project', type: 'str', value: 'arkiv-chain-indexer-baseload' }, { name: 'random_number_0_21eaaa3098b459fe', type: 'u64', value: '0x6c9cfffaf132' }] }
const attr = (type: string, value: unknown) => decodeAttribute('0xAB', { name: 'a', type, value })
test('decodes entity row', () => {
  expect(decodeEntity(fixture).entity).toEqual({ key: fixture.key!, owner: fixture.owner!, creator: fixture.creator!, created_at: 742900, updated_at: 742900, expires_at: 743800, creation_flags: 0, content_type: 'application/octet-stream' })
})
test('decodes str', () => {
  expect(decodeEntity(fixture).attributes[0]).toEqual({ key: fixture.key!, name: 'project', type: 'str', value: 'arkiv-chain-indexer-baseload', num: null })
})
test('decodes u64 hex to decimal', () => {
  expect(decodeEntity(fixture).attributes[1]).toMatchObject({ value: '119421565333810', num: 119421565333810 })
})
test('decodes u256 above 2^53 exactly', () => {
  const value = '0x1' + '0'.repeat(63)
  expect(attr('u256', value).value).toBe((1n << 252n).toString())
  expect(Number.isFinite(attr('u256', value).num)).toBe(true)
})
test('decodes i32 json number', () => { expect(attr('i32', -5)).toMatchObject({ value: '-5', num: -5 }) })
test('decodes dec string', () => { expect(attr('dec', '3.5')).toMatchObject({ value: '3.5', num: 3.5 }) })
test('decodes bool', () => {
  expect(attr('bool', true)).toMatchObject({ value: 'true', num: 1 })
  expect(attr('bool', false)).toMatchObject({ value: 'false', num: 0 })
})
test('lowercases addr, key, bytes32 and entity addresses', () => {
  for (const type of ['addr', 'key', 'bytes32']) expect(attr(type, '0xAB')).toMatchObject({ key: '0xab', value: '0xab', num: null })
  expect(decodeEntity({ ...fixture, key: '0xAB', owner: '0xCD', creator: '0xEF' }).entity).toMatchObject({ key: '0xab', owner: '0xcd', creator: '0xef' })
})
test('creationFlags as number', () => { expect(decodeEntity({ ...fixture, creationFlags: 2 }).entity.creation_flags).toBe(2) })
test('optional content and attributes may be absent', () => {
  const decoded = decodeEntity({ ...fixture, contentType: undefined, attributes: undefined })
  expect(decoded.entity.content_type).toBeNull(); expect(decoded.attributes).toEqual([])
})
