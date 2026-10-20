import { expect, test } from 'bun:test'
import { highlightSql } from '../lib/sql-highlight'

test('sql tokens cover the input and classify keywords, functions, strings, numbers, comments and operators', () => {
  const sql = "-- top\nSELECT count(*) AS n, 'a''b' FROM entities WHERE x >= 10 AND \"select\" = 1::BIGINT"
  const tokens = highlightSql(sql)
  expect(tokens.map(t => t.text).join('')).toBe(sql)
  const cls = (text: string) => tokens.find(t => t.text === text)?.cls
  expect(cls('-- top')).toBe('sx-cm')
  expect(cls('SELECT')).toBe('sx-kw')
  expect(cls('count')).toBe('sx-fn')
  expect(cls("'a''b'")).toBe('sx-str')
  expect(cls('10')).toBe('sx-num')
  expect(cls('>=')).toBe('sx-op')
  expect(cls('BIGINT')).toBe('sx-kw')
  expect(cls('"select"')).toBeUndefined()
  expect(cls('entities')).toBeUndefined()
})
