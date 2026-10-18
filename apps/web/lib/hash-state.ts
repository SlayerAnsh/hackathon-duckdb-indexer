export function readHash(): string | null {
 try { const value = window.location.hash.slice(1); if (!value) return null; return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0))) } catch { return null }
}
export function writeHash(sql: string): void {
 const encoded = btoa(Array.from(new TextEncoder().encode(sql), b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
 window.history.replaceState(null, '', '#' + encoded)
}
