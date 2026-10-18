import { test, expect } from 'bun:test'
import { decimalValue, fieldConverter } from '../lib/arrow-value'

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
