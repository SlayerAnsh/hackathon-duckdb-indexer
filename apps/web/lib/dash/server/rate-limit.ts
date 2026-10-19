export type Rule = { limit: number; windowMs: number }
export const WRITE_RULES: Rule[] = [{ limit: 5, windowMs: 60_000 }, { limit: 40, windowMs: 3_600_000 }]
export const GLOBAL_WRITE_RULES: Rule[] = [{ limit: 80, windowMs: 3_600_000 }]
export const NONCE_RULES: Rule[] = [{ limit: 20, windowMs: 60_000 }]

export class RateLimiter {
  private readonly hits = new Map<string, number[]>()
  constructor(private readonly rules: Rule[], private readonly now: () => number = Date.now) {}
  take(id: string): { ok: true } | { ok: false; retryAfterSec: number } {
    const now = this.now(), longest = Math.max(0, ...this.rules.map(rule => rule.windowMs))
    const hits = (this.hits.get(id) ?? []).filter(time => time > now - longest)
    this.hits.set(id, hits)
    let retryMs = 0
    for (const rule of this.rules) {
      const window = hits.filter(time => time > now - rule.windowMs)
      if (window.length >= rule.limit) retryMs = Math.max(retryMs, window[window.length - rule.limit] + rule.windowMs - now)
    }
    if (retryMs > 0) return { ok: false, retryAfterSec: Math.ceil(retryMs / 1000) }
    hits.push(now)
    return { ok: true }
  }
}
