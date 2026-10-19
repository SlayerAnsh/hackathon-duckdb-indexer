import { isOfficialUser } from '../official'
import { isIP } from 'node:net'
import { recoverMessageAddress, type Hex } from 'viem'
import type { ServerDashConfig } from './config'
import type { PrivyVerifier } from './privy'
import type { NonceStore } from './nonce'
import type { RateLimiter } from './rate-limit'
import { dashErrors, errorResponse, json } from './errors'
import { clearSessionCookie, readCookie, SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookie, signSession, verifySession, type Session } from './session'

export type AuthDeps = { config: Pick<ServerDashConfig, 'sessionSecret'> & Partial<Pick<ServerDashConfig, 'wallet'>>; privy: PrivyVerifier; nonces: NonceStore; nonceLimiter: RateLimiter; now: () => number }
export function publicHost(req: Request): string {
  return (req.headers.get('x-forwarded-host')?.split(',')[0].trim() ||
    req.headers.get('host')?.trim() || new URL(req.url).host).toLowerCase()
}
export function clientIp(req: Request): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',').map(value => value.trim()).filter(Boolean).at(-1) ||
    req.headers.get('x-real-ip')?.trim() || 'unknown'
  if (isIP(ip) !== 6) return ip
  // Expand compressed IPv6, including the optional dotted IPv4 tail, before grouping.
  const address = ip.toLowerCase().split('%')[0].replace(/(\d+\.\d+\.\d+\.\d+)$/, tail => {
    const bytes = tail.split('.').map(Number)
    return `${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`
  })
  const [left, right] = address.split('::')
  const start = left ? left.split(':') : []
  const end = right ? right.split(':') : []
  const parts = right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill('0'), ...end]
  return parts.slice(0, 4).map(part => part.padStart(4, '0')).join(':') + '::/64'
}
export function isSecure(req: Request): boolean { return new URL(req.url).protocol === 'https:' }
export function assertWriteRequest(req: Request): void {
  const origin = req.headers.get('origin')
  if (origin !== null) {
    let host: string
    try { host = new URL(origin).host } catch { throw dashErrors.forbidden() }
    if (host.toLowerCase() !== publicHost(req)) throw dashErrors.forbidden()
  }
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw dashErrors.invalid('Content-Type must be application/json')
  }
}
export async function readJson(req: Request): Promise<unknown> {
  const limit = 32 * 1024
  if (Number(req.headers.get('content-length')) > limit) throw dashErrors.invalid('Request body exceeds 32 KiB')
  const reader = req.body?.getReader()
  if (!reader) throw dashErrors.invalid('Invalid JSON body')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw dashErrors.invalid('Request body exceeds 32 KiB')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch { throw dashErrors.invalid('Invalid JSON body or body exceeds 32 KiB') }
  finally { reader.releaseLock() }
}
export function requireSession(req: Request, deps: Pick<AuthDeps, 'config' | 'now'>): Session {
  const token = readCookie(req, SESSION_COOKIE)
  const session = token ? verifySession(token, deps.config.sessionSecret, deps.now() / 1000) : null
  if (!session) throw dashErrors.unauthenticated()
  return session
}
export async function handleNonce(req: Request, deps: AuthDeps): Promise<Response> {
  try {
    const limit = deps.nonceLimiter.take(clientIp(req))
    if (!limit.ok) throw dashErrors.rateLimited(limit.retryAfterSec)
    return json(deps.nonces.issue(publicHost(req), clientIp(req)))
  } catch (e) { return errorResponse(e) }
}
export async function handleCreateSession(req: Request, deps: AuthDeps): Promise<Response> {
  try {
    assertWriteRequest(req)
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
    if (!bearer) throw dashErrors.unauthenticated()
    const body = await readJson(req)
    if (!body || typeof body !== 'object' || !('nonce' in body) || typeof body.nonce !== 'string' ||
      !('signature' in body) || typeof body.signature !== 'string') throw dashErrors.invalid('nonce and signature are required')
    const nonce = deps.nonces.consume(body.nonce)
    if (!nonce) throw dashErrors.unauthenticated()
    let identity, address: string
    try { identity = await deps.privy.verify(bearer[1]) } catch { throw dashErrors.unauthenticated() }
    try { address = (await recoverMessageAddress({ message: nonce.message, signature: body.signature as Hex })).toLowerCase() }
    catch { throw dashErrors.unauthenticated() }
    if (isOfficialUser(address, deps.config.wallet ?? '')) throw dashErrors.forbidden()
    if (!identity.wallets.some(wallet => wallet.toLowerCase() === address)) throw dashErrors.unauthenticated()
    if (identity.login === null) throw dashErrors.forbidden('Use Google, Discord, X or Telegram to log in.')
    const info = { address, login: identity.login }
    const token = signSession({ ...info, exp: Math.floor(deps.now() / 1000) + SESSION_TTL_SECONDS }, deps.config.sessionSecret)
    return json(info, { headers: { 'Set-Cookie': sessionCookie(token, isSecure(req)) } })
  } catch (e) { return errorResponse(e) }
}
export async function handleGetSession(req: Request, deps: AuthDeps): Promise<Response> {
  try {
    const { address, login } = requireSession(req, deps)
    return json({ address, login })
  } catch (e) { return errorResponse(e) }
}
export async function handleDeleteSession(req: Request): Promise<Response> {
  try {
    assertWriteRequest(req)
    return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie(isSecure(req)) } })
  } catch (e) { return errorResponse(e) }
}
