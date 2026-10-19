import { createHmac, timingSafeEqual } from 'node:crypto'
import { isHexAddress, LOGINS, type Login } from '../schema'

export type Session = { address: string; login: Login; exp: number }
export type { SessionInfo } from '../schema'
export const SESSION_COOKIE = 'dash_session'
export const SESSION_TTL_SECONDS = 28800
export function deriveSessionSecret(appSecret: string): Buffer {
  return createHmac('sha256', appSecret).update('arkiv-dash-session-v1').digest()
}
function signature(payload: string, secret: Buffer): Buffer {
  return createHmac('sha256', secret).update(payload).digest()
}
export function signSession(session: Session, secret: Buffer): string {
  const payload = Buffer.from(JSON.stringify({ ...session, address: session.address.toLowerCase() })).toString('base64url')
  return `${payload}.${signature(payload, secret).toString('base64url')}`
}
export function verifySession(token: string, secret: Buffer, nowSec: number): Session | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null
    const [payload, mac] = parts
    const actual = Buffer.from(mac, 'base64url'), expected = signature(payload, secret)
    if (actual.toString('base64url') !== mac || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    const session: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!session || typeof session !== 'object') return null
    const { address, login, exp } = session as Record<string, unknown>
    if (typeof address !== 'string' || !isHexAddress(address) || address !== address.toLowerCase() ||
      !LOGINS.includes(login as Login) || typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= nowSec) return null
    return { address, login: login as Login, exp }
  } catch { return null }
}
export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`
}
export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`
}
export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index >= 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}
