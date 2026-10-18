import { test, expect } from 'bun:test'
import { statSummary, formatStatValue, formatShare } from '../lib/stat'
import type { Widget } from '../lib/views'

const widget = (note?: Widget['note']): Widget => ({ id: 's', title: 'S', sql: 'SELECT 1', kind: 'stat', y: 'value', note })
const data = (columns: string[], ...rows: unknown[][]) => ({ columns, rows })

test('stat values use grouped integers, compact millions and one decimal for fractions', () => {
 expect(formatStatValue(0)).toBe('0')
 expect(formatStatValue(30700)).toBe('30,700')
 expect(formatStatValue(999999)).toBe('999,999')
 expect(formatStatValue(1250000)).toBe('1.3m')
 expect(formatStatValue(12.345)).toBe('12.3')
})

test('shares are percentages with one decimal and never round a non zero share to zero', () => {
 expect(formatShare(0.3667)).toBe('36.7%')
 expect(formatShare(1)).toBe('100%')
 expect(formatShare(0)).toBe('0%')
 expect(formatShare(0.0004)).toBe('<0.1%')
})

test('share note divides value by total and exposes a clamped meter', () => {
 const s = statSummary(widget({ kind: 'share', text: '{n} of live entities' }), data(['value', 'total'], [BigInt(11), BigInt(30)]))
 expect(s).toEqual({ value: '11', note: '36.7% of live entities', share: 11 / 30 })
})

test('ratio note divides total by value', () => {
 const s = statSummary(widget({ kind: 'ratio', text: '{n} entities per creator' }), data(['value', 'total'], [4, 30]))
 expect(s).toEqual({ value: '4', note: '7.5 entities per creator' })
})

test('total note formats the companion column', () => {
 const s = statSummary(widget({ kind: 'total', text: 'at head block {n}' }), data(['value', 'total'], [10, 1234567]))
 expect(s).toEqual({ value: '10', note: 'at head block 1,234,567' })
})

test('missing or zero companions drop the note instead of printing NaN', () => {
 expect(statSummary(widget({ kind: 'share', text: '{n} of live' }), data(['value', 'total'], [0, 0]))).toEqual({ value: '0' })
 expect(statSummary(widget({ kind: 'ratio', text: '{n} each' }), data(['value', 'total'], [0, 0]))).toEqual({ value: '0' })
 expect(statSummary(widget({ kind: 'total', text: 'at {n}' }), data(['value', 'total'], [3, null]))).toEqual({ value: '3' })
 expect(statSummary(widget(), data(['value'], [5]))).toEqual({ value: '5' })
})

test('no rows or a null value yields no summary', () => {
 expect(statSummary(widget(), data(['value']))).toBeNull()
 expect(statSummary(widget(), data(['value'], [null]))).toBeNull()
})

test('an address column names the subject of the stat', () => {
 const addr = '0x6cb4a1b2c3d4e5f60718293a4b5c6d7e8f905e22'
 const s = statSummary(widget({ kind: 'share', text: '{n} of live entities' }), data(['value', 'total', 'address'], [7309, 31235, addr]))
 expect(s).toEqual({ value: '7,309', note: '23.4% of live entities', share: 7309 / 31235, address: addr })
 expect(statSummary(widget(), data(['value', 'address'], [5, null]))).toEqual({ value: '5' })
 expect(statSummary(widget(), data(['value', 'address'], [5, '']))).toEqual({ value: '5' })
})
