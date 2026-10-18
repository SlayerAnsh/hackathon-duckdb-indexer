/** URL safe base64 of the UTF-8 bytes of `sql`, without padding and without a leading `#`. */
export function encodeSqlHash(sql: string): string {
 return btoa(Array.from(new TextEncoder().encode(sql), b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
/** Inverse of `encodeSqlHash`. Accepts an optional leading `#`. Returns null for empty or invalid input. */
export function decodeSqlHash(hash: string): string | null {
 try {
  const value = hash.startsWith('#') ? hash.slice(1) : hash
  if (!value) return null
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)))
 } catch { return null }
}
export function readHash(): string | null {
 try { return decodeSqlHash(window.location.hash) } catch { return null }
}
export function writeHash(sql: string): void {
 window.history.replaceState(null, '', '#' + encodeSqlHash(sql))
}
