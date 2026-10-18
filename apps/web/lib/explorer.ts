/** Block explorer base URL for the indexed chain, without a trailing slash. */
export const EXPLORER_URL = (process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://tiramisu.explorer.arkiv.network').replace(/\/+$/, '')

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

/** True for a 20 byte hex account address. Entity keys (32 bytes) do not match. */
export const isAddress = (value: string) => ADDRESS.test(value)

/** Explorer page of an account address, or null when the value is not an address. */
export function addressUrl(addr: string): string | null {
 return isAddress(addr) ? `${EXPLORER_URL}/address/${addr}` : null
}
