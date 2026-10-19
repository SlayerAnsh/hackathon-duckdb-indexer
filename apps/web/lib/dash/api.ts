import type { DashErrorCode, SessionInfo, Size, WidgetPayload, WriteResult } from './schema'

export class DashApiError extends Error {
  constructor(public code: DashErrorCode, public status: number, message: string, public retryAfterSec?: number) {
    super(message)
    this.name = 'DashApiError'
  }
}

export type DashApi = {
  session(): Promise<SessionInfo | null>
  nonce(): Promise<{ nonce: string; message: string }>
  createSession(accessToken: string, nonce: string, signature: string): Promise<SessionInfo>
  logout(): Promise<void>
  createWidget(body: { replaces?: string; widget: WidgetPayload; addTo?: { dashboard: string; size: Size } }): Promise<WriteResult>
  createDashboard(body: { title: string; description?: string }): Promise<WriteResult>
  updateDashboard(key: string, body: { title: string; description?: string }): Promise<WriteResult>
  deleteDashboard(key: string): Promise<WriteResult>
  organize(key: string, body: { title?: string; items: { link: string | null; widget: string; size: Size }[] }): Promise<WriteResult>
  addLink(key: string, body: { widget: string; size: Size }): Promise<WriteResult>
}

export function createDashApi(fetchImpl: typeof fetch = fetch, base = ''): DashApi {
  async function request<T>(path: string, method: string, body?: unknown, accessToken?: string): Promise<T> {
    const headers = new Headers({ 'content-type': 'application/json' })
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)
    const response = await fetchImpl(`${base}/api/dash/${path}`, {
      method, headers, credentials: 'same-origin',
      ...(method === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => null)
      const retry = response.headers.get('retry-after')
      const seconds = retry !== null && /^\d+$/.test(retry) ? Number(retry) : undefined
      throw new DashApiError(error?.error ?? 'chain', response.status,
        error?.message ?? 'Request failed.', seconds !== undefined && Number.isFinite(seconds) ? seconds : undefined)
    }
    return response.json() as Promise<T>
  }
  const dashboardPath = (key: string) => `dashboards/${encodeURIComponent(key)}`
  return {
    async session() {
      try { return await request<SessionInfo>('auth/session', 'GET') }
      catch (error) { if (error instanceof DashApiError && error.status === 401) return null; throw error }
    },
    nonce: () => request('auth/nonce', 'POST'),
    createSession: (token, nonce, signature) => request('auth/session', 'POST', { nonce, signature }, token),
    async logout() { await request('auth/session', 'DELETE') },
    createWidget: body => request('widgets', 'POST', body),
    createDashboard: body => request('dashboards', 'POST', body),
    updateDashboard: (key, body) => request(dashboardPath(key), 'PUT', body),
    deleteDashboard: key => request(dashboardPath(key), 'DELETE'),
    organize: (key, body) => request(`${dashboardPath(key)}/organize`, 'POST', body),
    addLink: (key, body) => request(`${dashboardPath(key)}/links`, 'POST', body),
  }
}

export const dashApi: DashApi = createDashApi()
