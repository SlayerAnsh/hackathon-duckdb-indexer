import { test, expect } from 'bun:test'
import { EXPLORER_URL, addressUrl, isAddress } from '../lib/explorer'

const addr = '0x6cb4a1b2c3d4e5f60718293a4b5c6d7e8f905e22'

test('explorer defaults to the Tiramisu block explorer', () => {
 expect(EXPLORER_URL).toBe(process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://tiramisu.explorer.arkiv.network')
})

test('address urls point at the explorer address page', () => {
 expect(addressUrl(addr)).toBe(`${EXPLORER_URL}/address/${addr}`)
 expect(addressUrl(addr.toUpperCase().replace('0X', '0x'))).toBe(`${EXPLORER_URL}/address/${addr.toUpperCase().replace('0X', '0x')}`)
})

test('anything that is not a 20 byte hex address has no url', () => {
 for (const v of ['', 'creator0', '0x', addr.slice(0, -1), addr + '0', '0x' + 'ab'.repeat(32), addr.replace('0x', ''), addr.replace('a', 'g'), ` ${addr}`]) {
  expect(addressUrl(v)).toBeNull()
  expect(isAddress(v)).toBe(false)
 }
 expect(isAddress(addr)).toBe(true)
})
