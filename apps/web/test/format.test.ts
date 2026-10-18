import { test, expect } from 'bun:test'
import { shortHex, blockAge, formatMs, compact } from '../lib/format'
test('format examples and boundaries', () => {
 expect(shortHex('0x1234567890abcd')).toBe('0x1234…abcd')
 expect(shortHex('abc')).toBe('abc')
 for (const [blocks, label] of [[6,'12 s'],[150,'5 min'],[5400,'3 h'],[86400,'2 d']] as const) expect(blockAge(0,blocks)).toBe(label)
 expect(blockAge(20,10)).toBe('0 s')
 expect(formatMs(.8)).toBe('0.8 ms'); expect(formatMs(12.4)).toBe('12.4 ms'); expect(formatMs(125)).toBe('125.0 ms')
 expect(compact(1200)).toBe('1.2k'); expect(compact(30700)).toBe('30.7k'); expect(compact(0)).toBe('0')
})
