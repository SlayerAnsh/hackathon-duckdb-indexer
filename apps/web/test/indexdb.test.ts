import { expect, test } from 'bun:test'
import type { Delta, Manifest } from '@asi/core'
import { applyDeltaSql, chainCheck } from '../lib/indexdb'

const empty: Delta = { fromBlock: 1, toBlock: 2, entities: [], attributes: [], tombstones: [] }

test('empty delta clears all three tables', () => {
  expect(applyDeltaSql(empty)).toEqual(['DELETE FROM delta_entities', 'DELETE FROM delta_attributes', 'DELETE FROM delta_tombstones'])
})

test('delta escapes strings, leaves numbers unquoted and preserves NULL', () => {
  const sql = applyDeltaSql({ ...empty,
    entities: [{ key: 'k', owner: 'o', creator: 'c', created_at: 1, updated_at: 2, expires_at: 10, content_type: null, creation_flags: 0 }],
    attributes: [{ key: 'k', name: "it's", type: 'str', value: "it's", num: null }, { key: 'k', name: 'n', type: 'i32', value: '42', num: 42 }],
    tombstones: [{ key: "it's", block: 9 }],
  }).join(';')
  expect(sql).toContain("'it''s'")
  expect(sql).toContain("'k', 'o', 'c', 1, 2, 10, NULL, 0")
  expect(sql).toContain("'str', 'it''s', NULL")
  expect(sql).toContain("'i32', '42', 42")
  expect(sql).toContain("'it''s', 9")
})

const manifest = { chainId: 1, genesisHash: '0xabc' } as Manifest
test('chain matches', () => expect(chainCheck(manifest, 1, '0xABC')).toEqual({ ok: true }))
test('chain mismatch has reason', () => {
  expect(chainCheck(manifest, 2, '0xabc').ok).toBe(false)
  expect(chainCheck(manifest, 2, '0xabc').reason).toMatch(/chain/i)
})
test('genesis mismatch has reason', () => {
  expect(chainCheck(manifest, 1, '0xdef').ok).toBe(false)
  expect(chainCheck(manifest, 1, '0xdef').reason).toMatch(/genesis/i)
})
