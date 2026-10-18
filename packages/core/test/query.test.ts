import { test, expect } from 'bun:test'
import { keyChunkQueries, ownerTerms, hasCreatorTerm } from '../src/query'
const key = (s: string) => '0x' + s.padStart(64, '0')
const addr = (s: string) => '0x' + s.padStart(40, '0')
test('builds one chunk', () => {
  const expression = `$creator = addr(${addr('ab')})`
  expect(keyChunkQueries(expression, [key('01'), key('02')])).toEqual([`(${expression}) AND ($key = key(${key('01')}) OR $key = key(${key('02')}))`])
})
test('splits 120 keys into 50, 50, 20', () => {
  const queries = keyChunkQueries(null, Array.from({ length: 120 }, (_, i) => key(i.toString(16))))
  expect(queries.map(q => q.match(/\$key/g)?.length)).toEqual([50, 50, 20])
})
test('empty keys gives []', () => { expect(keyChunkQueries('x', [])).toEqual([]) })
test('null expression', () => { expect(keyChunkQueries(null, [key('01')])).toEqual([`$key = key(${key('01')})`]) })
test('ownerTerms finds both', () => {
  expect(ownerTerms(`$creator = addr(${addr('AA')}) AND ($owner = addr(${addr('bb')}) OR type = str('x'))`)).toEqual({ creators: [addr('aa')], owners: [addr('bb')] })
})
test('hasCreatorTerm false without creator', () => {
  expect(hasCreatorTerm("type = str('x')")).toBe(false)
  expect(ownerTerms("type = str('x')")).toEqual({ creators: [], owners: [] })
  expect(hasCreatorTerm(`$creator=addr(${addr('AA')})`)).toBe(true)
})
test('finds all terms with whitespace', () => {
  expect(ownerTerms(`($creator\n = addr( ${addr('AA')} )) OR $creator=addr(${addr('bb')})`)).toEqual({ creators: [addr('aa'), addr('bb')], owners: [] })
})
test('supports custom chunks and rejects invalid chunk sizes', () => {
  expect(keyChunkQueries(null, [key('1'), key('2')], 1)).toHaveLength(2)
  for (const n of [0, -1, 1.5, NaN, Infinity]) expect(() => keyChunkQueries(null, [key('1')], n)).toThrow()
})
