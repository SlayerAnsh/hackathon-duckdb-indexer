import { test, expect } from 'bun:test'
import { arrowTypeName, decimalValue, fieldConverter } from '../lib/arrow-value'

test('Arrow type ids map to simple result column types', () => {
 const INT = 2, FLOAT = 3, UTF8 = 5, BOOL = 6, DECIMAL = 7, DATE = 8, TIME = 9, TIMESTAMP = 10, LARGE_UTF8 = 20
 for (const [typeId, name] of [
  [UTF8, 'text'], [LARGE_UTF8, 'text'], [INT, 'integer'], [FLOAT, 'float'],
  [DECIMAL, 'decimal'], [BOOL, 'boolean'], [TIMESTAMP, 'timestamp'], [DATE, 'date'], [TIME, 'time'],
  [12, 'other'],
 ] as const) expect(arrowTypeName({ typeId })).toBe(name)
 expect(arrowTypeName({})).toBe('other')
})

const big = (digits: string) => ({ toString: () => digits, toJSON: () => JSON.stringify(digits) })

test('hugeint sums become plain numbers instead of quoted JSON', () => {
 expect(decimalValue(big('31211'), 0)).toBe(31211)
 expect(decimalValue(big('-5'), 0)).toBe(-5)
 expect(decimalValue(big('123456789012345678901234'), 0)).toBe(BigInt('123456789012345678901234'))
})

test('scaled decimals divide by their scale', () => {
 expect(decimalValue(big('12345'), 2)).toBe(123.45)
})

test('non decimal fields and plain values pass through', () => {
 expect(fieldConverter({ typeId: 2 })(big('1'))).toEqual(expect.anything())
 expect(fieldConverter({ typeId: 7, scale: 0 })(null)).toBeNull()
 expect(fieldConverter({ typeId: 7, scale: 0 })(5)).toBe(5)
 expect(fieldConverter(undefined)('x')).toBe('x')
})
