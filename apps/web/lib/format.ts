export const shortHex = (v: string) => v.length > 12 && v.startsWith('0x') ? v.slice(0,6)+'…'+v.slice(-4) : v
export function blockAge(block: number, head: number) {
 const seconds = Math.max(0,head-block)*2
 return seconds < 60 ? `${Math.floor(seconds)} s` : seconds < 3600 ? `${Math.floor(seconds/60)} min` : seconds < 86400 ? `${Math.floor(seconds/3600)} h` : `${Math.floor(seconds/86400)} d`
}
export const formatMs = (ms: number) => `${ms.toFixed(1)} ms`
export function compact(n: number) {
 for(const [scale,suffix] of [[1e9,'b'],[1e6,'m'],[1e3,'k']] as const) if(Math.abs(n)>=scale) return (n/scale).toFixed(1).replace(/\.0$/,'')+suffix
 return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
