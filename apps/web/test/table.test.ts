import { test, expect } from 'bun:test'
import { numericColumns, formatCell } from '../lib/table'

test('a column is numeric only when every non null value is a number or bigint', () => {
 expect(numericColumns(['a', 'b', 'c', 'd', 'e'], [[1, 'x', null, BigInt(2), 1], [2.5, 'y', null, null, '2']])).toEqual([true, false, false, true, false])
 expect(numericColumns(['a'], [])).toEqual([false])
})

test('floats round to two decimals with grouping', () => {
 expect(formatCell('avg', 554.8426966292135)).toBe('554.84')
 expect(formatCell('avg', 12345.6)).toBe('12,345.6')
 expect(formatCell('hours_remaining', -0.004)).toBe('0')
 expect(formatCell('avg', 0.5)).toBe('0.5')
})

test('plain integers get grouping, block numbers and timestamps do not', () => {
 expect(formatCell('count', 30700)).toBe('30,700')
 expect(formatCell('count', BigInt(1234567))).toBe('1,234,567')
 expect(formatCell('updated_at', 1234567)).toBe('1234567')
 expect(formatCell('expires_at', BigInt(1234567))).toBe('1234567')
 expect(formatCell('block', 1234567)).toBe('1234567')
 expect(formatCell('head_block', 1234567)).toBe('1234567')
 expect(formatCell('max', 1760000000000)).toBe('1760000000000')
 expect(formatCell('max', BigInt('123456789012345678901'))).toBe('123456789012345678901')
})

test('text keeps the short hex form and null is empty', () => {
 expect(formatCell('key', '0x' + 'ab'.repeat(32))).toBe('0xabab…abab')
 expect(formatCell('name', 'status')).toBe('status')
 expect(formatCell('x', null)).toBe('')
})
