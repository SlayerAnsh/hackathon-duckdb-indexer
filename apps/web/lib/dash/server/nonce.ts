import { randomBytes } from 'node:crypto'
import { dashErrors } from './errors'

export function signInMessage(domain: string, nonce: string, issuedAt: string): string {
  return ['Sign in to Arkiv SQL dashboards', `Domain: ${domain}`, `Nonce: ${nonce}`, `Issued at: ${issuedAt}`,
    'This signature proves you control this wallet. It costs nothing and sends no transaction.'].join('\n')
}
export class NonceStore {
  private readonly entries = new Map<string, { message: string; expires: number; ip: string }>()
  private readonly ttlMs: number
  private readonly max: number
  private readonly perIp: number
  private readonly now: () => number
  constructor(opts: { ttlMs?: number; max?: number; perIp?: number; now?: () => number } = {}) {
    this.ttlMs = opts.ttlMs ?? 300000
    this.max = opts.max ?? 10000
    this.perIp = opts.perIp ?? 5
    this.now = opts.now ?? Date.now
    if (!Number.isInteger(this.max) || this.max < 1) throw new Error('Nonce capacity must be positive.')
    if (!Number.isInteger(this.perIp) || this.perIp < 1) throw new Error('Nonce per IP capacity must be positive.')
  }
  issue(domain: string, ip: string): { nonce: string; message: string } {
    const now = this.now()
    for (const [key, entry] of this.entries) if (entry.expires <= now) this.entries.delete(key)
    const own = [...this.entries].filter(([, entry]) => entry.ip === ip)
    if (own.length >= this.perIp) this.entries.delete(own[0][0])
    if (this.entries.size >= this.max) throw dashErrors.busy()
    const nonce = randomBytes(32).toString('hex')
    const message = signInMessage(domain, nonce, new Date(now).toISOString())
    this.entries.set(nonce, { message, expires: now + this.ttlMs, ip })
    return { nonce, message }
  }
  consume(nonce: string): { message: string } | null {
    const entry = this.entries.get(nonce)
    this.entries.delete(nonce)
    return entry && entry.expires > this.now() ? { message: entry.message } : null
  }
}
