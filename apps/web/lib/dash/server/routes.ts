import type { ServerDashConfig } from './config'
import { SIZES, isEntityKey, parseDashboardPayload, parseWidgetPayload, type Parsed, type Size, type WriteResult } from '../schema'
import { assertWriteRequest, readJson, requireSession } from './auth'
import type { DashDeps } from './deps'
import { DashError, dashErrors, errorResponse, json } from './errors'
import * as ops from './operations'
import type { Session } from './session'

export async function withDeps(deps: DashDeps | { disabled: string }, fn: (deps: DashDeps) => Promise<Response>): Promise<Response> {
  if ('disabled' in deps) return errorResponse(dashErrors.disabled())
  return fn(deps)
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw dashErrors.invalid('Expected a JSON object.')
  return value as Record<string, unknown>
}
function parsed<T>(result: Parsed<T>): T {
  if (!result.ok) throw dashErrors.invalid(result.error)
  return result.value
}
function entityKey(value: unknown): string {
  if (typeof value !== 'string' || !isEntityKey(value)) throw dashErrors.invalid('Invalid entity key.')
  return value.toLowerCase()
}
function size(value: unknown): Size {
  if (!SIZES.includes(value as Size)) throw dashErrors.invalid('Invalid widget size.')
  return value as Size
}
function dashboard(body: Record<string, unknown>) {
  return parsed(parseDashboardPayload({ v: 1, title: body.title, description: body.description }))
}
async function write(req: Request, deps: DashDeps, run: (session: Session, body: Record<string, unknown>) => Promise<WriteResult>): Promise<Response> {
  try {
    assertWriteRequest(req)
    const session = requireSession(req, deps)
    for (const [limiter, id] of [[deps.writeLimiter, session.address], [deps.globalLimiter, 'all']] as const) {
      const result = limiter.take(id)
      if (!result.ok) throw dashErrors.rateLimited(result.retryAfterSec)
    }
    return json(await run(session, object(await readJson(req))))
  } catch (error) {
    // Provider errors may include signed request data. Only domain errors are safe to expose or log.
    return errorResponse(error instanceof DashError ? error : undefined)
  }
}
export function handleCreateWidget(req: Request, deps: DashDeps): Promise<Response> {
  return write(req, deps, (session, body) => {
    const widget = parsed(parseWidgetPayload(body.widget))
    let addTo: { dashboard: string; size: Size } | undefined
    if (body.addTo !== undefined) {
      const value = object(body.addTo)
      addTo = { dashboard: entityKey(value.dashboard), size: size(value.size) }
    }
    const replaces = body.replaces === undefined ? undefined : entityKey(body.replaces)
    if (addTo && replaces) throw dashErrors.invalid('Choose addTo or replaces, not both.')
    return ops.createWidget(deps.ops, session, { widget, addTo, replaces })
  })
}
export function handleCreateDashboard(req: Request, deps: DashDeps): Promise<Response> {
  return write(req, deps, (session, body) => ops.createDashboard(deps.ops, session, dashboard(body)))
}
export function handleUpdateDashboard(req: Request, deps: DashDeps, key: string): Promise<Response> {
  return write(req, deps, (session, body) => ops.updateDashboard(deps.ops, session, entityKey(key), dashboard(body)))
}
export function handleDeleteDashboard(req: Request, deps: DashDeps, key: string): Promise<Response> {
  return write(req, deps, session => ops.deleteDashboard(deps.ops, session, entityKey(key)))
}
export function handleOrganize(req: Request, deps: DashDeps, key: string): Promise<Response> {
  return write(req, deps, (session, body) => ops.organizeDashboard(deps.ops, session, entityKey(key), parsed(ops.parseOrganizeInput(body))))
}
export function handleAddLink(req: Request, deps: DashDeps, key: string): Promise<Response> {
  return write(req, deps, (session, body) => ops.addLink(deps.ops, session, entityKey(key), { widget: entityKey(body.widget), size: size(body.size) }))
}

export function handleDashConfig(deps: { config: ServerDashConfig | null }): Response {
  return json({ wallet: deps.config?.wallet ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}
