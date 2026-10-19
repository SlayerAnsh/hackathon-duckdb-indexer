import { expect, test, spyOn } from 'bun:test'
import { dashErrors, errorResponse } from '../lib/dash/server/errors'
import { deriveSessionSecret, signSession, verifySession, sessionCookie, clearSessionCookie, readCookie } from '../lib/dash/server/session'
import { NonceStore } from '../lib/dash/server/nonce'
import { RateLimiter, WRITE_RULES, GLOBAL_WRITE_RULES, NONCE_RULES } from '../lib/dash/server/rate-limit'
import { WriteQueue } from '../lib/dash/server/queue'

test('session round trip, tamper, expiry and cookie flags', () => {
  const secret = deriveSessionSecret('app-secret')
  const token = signSession({ address: '0x' + 'ab'.repeat(20), login: 'x', exp: 2000 }, secret)
  expect(verifySession(token, secret, 1999)).toEqual({ address: '0x' + 'ab'.repeat(20), login: 'x', exp: 2000 })
  expect(verifySession(token, secret, 2000)).toBeNull()
  expect(verifySession(token.slice(0, -2) + 'AA', secret, 1)).toBeNull()
  expect(verifySession(token, deriveSessionSecret('other'), 1)).toBeNull()
  expect(verifySession('garbage', secret, 1)).toBeNull()
  expect(sessionCookie(token, true)).toBe(`dash_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800; Secure`)
  expect(clearSessionCookie(false)).toBe('dash_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')
  expect(readCookie(new Request('http://h', { headers: { cookie: 'a=1; dash_session=tok' } }), 'dash_session')).toBe('tok')
})
test('nonces are single use and expire after five minutes', () => {
  let now = 0
  const store = new NonceStore({ now: () => now })
  const a = store.issue('arkiv-sql.example')
  expect(a.nonce).toMatch(/^[0-9a-f]{64}$/)
  expect(a.message.split('\n')).toEqual(['Sign in to Arkiv SQL dashboards', 'Domain: arkiv-sql.example', `Nonce: ${a.nonce}`,
    'Issued at: 1970-01-01T00:00:00.000Z', 'This signature proves you control this wallet. It costs nothing and sends no transaction.'])
  expect(store.consume(a.nonce)).toEqual({ message: a.message }); expect(store.consume(a.nonce)).toBeNull()
  const b = store.issue('h'); now = 300_001; expect(store.consume(b.nonce)).toBeNull()
})
test('rate limiter applies every rule and reports retry after', () => {
  let now = 0
  const limiter = new RateLimiter([{ limit: 2, windowMs: 60_000 }, { limit: 3, windowMs: 3_600_000 }], () => now)
  expect(limiter.take('a').ok).toBe(true); expect(limiter.take('a').ok).toBe(true)
  expect(limiter.take('a')).toEqual({ ok: false, retryAfterSec: 60 }); expect(limiter.take('b').ok).toBe(true)
  now = 60_000; expect(limiter.take('a').ok).toBe(true); now = 120_000; expect(limiter.take('a').ok).toBe(false)
  expect(WRITE_RULES).toEqual([{ limit: 5, windowMs: 60_000 }, { limit: 40, windowMs: 3_600_000 }])
  expect(GLOBAL_WRITE_RULES).toEqual([{ limit: 80, windowMs: 3_600_000 }]); expect(NONCE_RULES).toEqual([{ limit: 20, windowMs: 60_000 }])
})
test('write queue runs jobs one at a time in order and rejects when full', async () => {
  const queue = new WriteQueue(2), order: string[] = []
  let release!: () => void
  const first = queue.run(() => new Promise<void>(r => { order.push('a start'); release = () => { order.push('a end'); r() } }))
  const second = queue.run(async () => { order.push('b') })
  const third = queue.run(async () => { order.push('c') })
  await expect(queue.run(async () => {})).rejects.toMatchObject({ code: 'busy', status: 503 })
  release(); await Promise.all([first, second, third])
  expect(order).toEqual(['a start', 'a end', 'b', 'c'])
  await expect(queue.run(async () => { throw new Error('x') })).rejects.toThrow('x')
  await expect(queue.run(async () => 7)).resolves.toBe(7)
})
test('error responses never leak raw errors', async () => {
  const log = spyOn(console, 'error').mockImplementation(() => {})
  const r = errorResponse(new Error('upstream failed'))
  expect(log).toHaveBeenCalledWith('upstream failed')
  log.mockRestore()
  expect(r.status).toBe(502); expect(await r.json()).toEqual({ error: 'chain', message: 'Arkiv write failed. Try again.' })
  const limited = errorResponse(dashErrors.rateLimited(30))
  expect(limited.status).toBe(429); expect(limited.headers.get('retry-after')).toBe('30')
})

test('session rejects signed invalid fields and cookies match exact names', () => {
  const secret = deriveSessionSecret('test-secret')
  for (const session of [
    { address: 'invalid', login: 'x', exp: 2000 },
    { address: '0x' + 'ab'.repeat(20), login: 'other', exp: 2000 },
    { address: '0x' + 'ab'.repeat(20), login: 'x', exp: 1.5 },
  ]) {
    expect(verifySession(signSession(session as Parameters<typeof signSession>[0], secret), secret, 1)).toBeNull()
  }
  expect(readCookie(new Request('http://h', { headers: { cookie: 'other_dash_session=no; dash_session=abc=def' } }), 'dash_session')).toBe('abc=def')
  expect(readCookie(new Request('http://h'), 'dash_session')).toBeNull()
  expect(clearSessionCookie(true)).toEndWith('; Secure')
  expect(sessionCookie('tok', false)).not.toContain('Secure')
})

test('nonce capacity evicts the oldest and expiry is exact', () => {
  let now = 0
  const store = new NonceStore({ max: 2, ttlMs: 100, now: () => now })
  const first = store.issue('h'), second = store.issue('h'), third = store.issue('h')
  expect(first.nonce).not.toBe(second.nonce)
  expect(store.consume(first.nonce)).toBeNull()
  expect(store.consume(second.nonce)).toEqual({ message: second.message })
  now = 100
  expect(store.consume(third.nonce)).toBeNull()
  const next = store.issue('h')
  expect(store.consume(next.nonce)).toEqual({ message: next.message })
})

test('denied rate limit hits do not consume allowance and retry covers every rule', () => {
  let now = 0
  const limiter = new RateLimiter([{ limit: 1, windowMs: 1000 }, { limit: 2, windowMs: 5000 }], () => now)
  expect(limiter.take('a').ok).toBe(true)
  now = 500
  expect(limiter.take('a')).toEqual({ ok: false, retryAfterSec: 1 })
  now = 1000
  expect(limiter.take('a').ok).toBe(true)
  expect(limiter.take('a')).toEqual({ ok: false, retryAfterSec: 4 })
  now = 5000
  expect(limiter.take('a').ok).toBe(true)
})

test('default queue allows 25 waiting jobs and recovers from synchronous failure', async () => {
  const queue = new WriteQueue()
  let release!: () => void
  const first = queue.run(() => new Promise<void>(resolve => { release = resolve }))
  const jobs = Array.from({ length: 25 }, (_, i) => queue.run(async () => i))
  expect(queue.waiting).toBe(25)
  await expect(queue.run(async () => 26)).rejects.toMatchObject({ code: 'busy', status: 503 })
  release()
  await Promise.all([first, ...jobs])
  expect(queue.waiting).toBe(0)
  await expect(queue.run(() => { throw new Error('sync failure') })).rejects.toThrow('sync failure')
  await expect(queue.run(async () => 7)).resolves.toBe(7)
})
