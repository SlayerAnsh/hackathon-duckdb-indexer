import { DashApiError, type DashApi } from './api'
import type { SessionInfo } from './schema'

export async function runSessionHandshake(deps: {
  api: DashApi
  getAccessToken(): Promise<string | null>
  signMessage(message: string): Promise<string>
}): Promise<SessionInfo> {
  const token = await deps.getAccessToken()
  if (!token) throw new Error('Login access token is unavailable.')
  const { nonce, message } = await deps.api.nonce()
  const signature = await deps.signMessage(message)
  return deps.api.createSession(token, nonce, signature)
}

export async function withSession<T>(fn: () => Promise<T>, requestLogin: () => Promise<boolean>): Promise<T> {
  try { return await fn() }
  catch (error) {
    if (!(error instanceof DashApiError) || error.status !== 401) throw error
    if (!await requestLogin()) throw error
    return fn()
  }
}

export function saveErrorMessage(error: unknown): string {
  return error instanceof DashApiError && error.status === 429
    ? 'Too many saves. Try again in a minute.'
    : "Couldn't save to Arkiv. Your draft is kept. Try again."
}
