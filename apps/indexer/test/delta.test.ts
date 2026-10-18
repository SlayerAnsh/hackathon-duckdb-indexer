import { test, expect } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { Store } from '../src/store'
import { writeDelta } from '../src/delta'
import { temp, track, row, hash, expression } from './helpers'
for (const mode of ['upsert', 'remove', 'recreate', 'empty']) test('delta ' + mode, async () => {
  const dir = await temp(), s = track(await Store.open(dir, expression, 1, hash))
  await s.setState({ snapshot_block: 100, head_block: 105 })
  if (mode !== 'empty') await s.upsert([row()], 101)
  if (mode === 'remove' || mode === 'recreate') await s.remove(['0x01'], 102)
  if (mode === 'recreate') await s.upsert([row()], 103)
  const d = await writeDelta(s, dir)
  expect(d.fromBlock).toBe(101); expect(d.toBlock).toBe(105)
  expect(d.entities.length).toBe(mode === 'upsert' || mode === 'recreate' ? 1 : 0)
  expect(d.attributes.length).toBe(d.entities.length)
  expect(d.tombstones).toEqual(mode === 'remove' ? [{ key: '0x01', block: 102 }] : [])
  const json = JSON.parse(await readFile(dir + '/delta.json', 'utf8'))
  expect(json).toEqual(d)
  if (d.entities.length) expect(typeof json.entities[0].expires_at).toBe('number')
})
