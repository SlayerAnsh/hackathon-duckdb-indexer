import type { DashErrorCode } from '../schema'
export type { DashErrorCode, SessionInfo, WriteResult } from '../schema'

export class DashError extends Error {
  constructor(public readonly code: DashErrorCode, public readonly status: number, message: string, public readonly retryAfterSec?: number) {
    super(message)
    this.name = 'DashError'
  }
}
export const dashErrors = {
  invalid: (m: string) => new DashError('invalid', 400, m),
  unauthenticated: () => new DashError('unauthenticated', 401, 'Sign in to continue.'),
  forbidden: (m = 'You do not have permission.') => new DashError('forbidden', 403, m),
  notFound: (m = 'Entity is missing or expired.') => new DashError('not_found', 404, m),
  conflict: (code: 'conflict' | 'at_cap' | 'full', m: string) => new DashError(code, 409, m),
  rateLimited: (retryAfterSec: number) => new DashError('rate_limited', 429, 'Too many requests. Try again later.', retryAfterSec),
  busy: (retryAfterSec = 5) => new DashError('busy', 503, 'Writes are busy. Try again shortly.', retryAfterSec),
  disabled: (m = 'Dashboards are not enabled on this deployment.') => new DashError('disabled', 503, m),
}
export function json(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(body), { ...init, headers })
}
export function errorResponse(error: unknown): Response {
  if (error instanceof DashError) {
    const headers = new Headers()
    if (error.retryAfterSec !== undefined) headers.set('Retry-After', String(error.retryAfterSec))
    return json({ error: error.code, message: error.message }, { status: error.status, headers })
  }
  if (error instanceof Error) console.error(error.message)
  return json({ error: 'chain', message: 'Arkiv write failed. Try again.' }, { status: 502 })
}
