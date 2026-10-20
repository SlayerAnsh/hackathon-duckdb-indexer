import { isOfficialOwned } from './official'
import { DASH_PROJECT, isEntityKey, isHexAddress } from './schema'

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
function address(value: string): string {
  if (!isHexAddress(value)) throw new Error('Invalid address')
  return quote(value.toLowerCase())
}
function entityKey(value: string): string {
  if (!isEntityKey(value)) throw new Error('Invalid entity key')
  return quote(value.toLowerCase())
}

export function officialSql(alias: string, wallet: string): string {
  const w = address(wallet)
  return `(${alias}.usr = ${w} AND ${alias}.owner = ${w})`
}
export function mineSql(alias: string, user: string): string {
  const a = address(user)
  return `((${alias}.type = 'widget' AND ${alias}.owner = ${a}) OR (${alias}.type <> 'widget' AND ${alias}.usr = ${a}))`
}

export function dashCte(wallet: string): string {
  return `WITH dash AS (
 SELECT e.key, e.owner, e.created_at, e.updated_at, e.expires_at,
  max(a.value) FILTER (WHERE a.name = 'type') AS type,
  max(a.value) FILTER (WHERE a.name = 'user') AS usr,
  max(a.value) FILTER (WHERE a.name = 'login') AS login,
  max(a.value) FILTER (WHERE a.name = 'name') AS name,
  max(a.value) FILTER (WHERE a.name = 'title') AS title,
  max(a.value) FILTER (WHERE a.name = 'chart') AS chart,
  max(a.value) FILTER (WHERE a.name = 'dashboard') AS dashboard,
  max(a.value) FILTER (WHERE a.name = 'slug') AS slug,
  max(a.value) FILTER (WHERE a.name = 'widget') AS widget
 FROM entities e JOIN attributes a ON a.key = e.key
 WHERE e.creator = ${address(wallet)}
 GROUP BY ALL
 HAVING max(a.value) FILTER (WHERE a.name = 'project') = ${quote(DASH_PROJECT)})`
}

export function userDashboardsSql(wallet: string, user: string, widgetKey: string | null): string {
  const cte = dashCte(wallet), usr = address(user)
  const hasWidget = widgetKey === null ? 'false' : `count(l.key) FILTER (WHERE l.widget = ${entityKey(widgetKey)}) > 0`
  return `${cte}
 SELECT d.key, d.title, count(l.key) AS widgets, ${hasWidget} AS has_widget, d.updated_at
 FROM dash d LEFT JOIN dash l ON l.type = 'link' AND l.dashboard = d.key
 WHERE d.type = 'dashboard' AND d.usr = ${usr}
 GROUP BY d.key, d.title, d.updated_at
 ORDER BY d.updated_at DESC, d.key`
}

export function widgetUsageSql(wallet: string, widgetKey: string, user: string | null): string {
  const cte = dashCte(wallet), widget = entityKey(widgetKey)
  const mine = user === null ? 'false' : `coalesce(bool_or(d.usr = ${address(user)}), false)`
  return `${cte}
 SELECT count(DISTINCT l.dashboard) AS dashboards, ${mine} AS mine
 FROM dash l JOIN dash d ON d.key = l.dashboard AND d.type = 'dashboard'
 WHERE l.type = 'link' AND l.widget = ${widget}`
}

export function syncedSql(key: string, afterBlock: number, op: 'upsert' | 'delete'): string {
  const k = entityKey(key)
  if (!Number.isSafeInteger(afterBlock) || afterBlock < 0) throw new Error('Invalid block')
  return op === 'delete'
    ? `SELECT CASE WHEN count(*) = 0 THEN 1 ELSE 0 END AS n FROM entities WHERE key = ${k}`
    : `SELECT CASE WHEN count(*) > 0 THEN 1 ELSE 0 END AS n FROM entities WHERE key = ${k} AND updated_at > ${afterBlock} AND NOT attrs_pending`
}

export type WidgetListQuery = { search: string; chart: import('./schema').ChartType | null; sort: 'newest' | 'used' | 'expiring'; user: string | null; limit: number; offset: number }
export type WidgetListItem = { key: string; name: string; chart: import('./schema').ChartType; user: string; owner: string; expiresAt: number; createdAt: number; uses: number }

function widgetFilters(q: Pick<WidgetListQuery, 'search' | 'chart' | 'user'>): string {
 const filters = ["w.type = 'widget'"]
 if (q.chart !== null) filters.push(`w.chart = ${quote(q.chart)}`)
 if (q.user !== null) filters.push(`w.owner = ${address(q.user)}`)
 if (q.search) {
  const term = q.search.toLowerCase()
  const literal = term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
  const byName = `lower(w.name) LIKE ${quote('%' + literal + '%')} ESCAPE '\\'`
  filters.push(/^0x[0-9a-f]{0,40}$/i.test(term) ? `(${byName} OR w.usr LIKE ${quote(term + '%')})` : `(${byName})`)
 }
 return filters.join(' AND ')
}

export function widgetListSql(wallet: string, q: WidgetListQuery): string {
 for (const n of [q.limit, q.offset]) if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid pagination')
 const order = { newest: 'w.created_at DESC', used: 'uses DESC', expiring: 'w.expires_at ASC' }[q.sort]
 if (!order) throw new Error('Invalid sort')
 return `${dashCte(wallet)}
 SELECT w.key, w.name, w.chart, w.usr, w.expires_at, w.created_at, w.owner, count(DISTINCT l.dashboard) AS uses
 FROM dash w LEFT JOIN dash l ON l.type = 'link' AND l.widget = w.key
 WHERE ${widgetFilters(q)}
 GROUP BY w.key, w.name, w.chart, w.usr, w.expires_at, w.created_at, w.owner
 ORDER BY ${order}, w.key
 LIMIT ${q.limit} OFFSET ${q.offset}`
}

export function widgetCountSql(wallet: string, q: Omit<WidgetListQuery, 'sort' | 'limit' | 'offset'>): string {
 return `${dashCte(wallet)} SELECT count(*) AS n FROM dash w WHERE ${widgetFilters(q)}`
}

export function myDashboardsSql(wallet: string, user: string): string {
  return `${dashCte(wallet)}
 SELECT d.key, d.title, count(l.key) AS widgets, d.updated_at
 FROM dash d LEFT JOIN dash l ON l.type = 'link' AND l.dashboard = d.key
 WHERE d.type = 'dashboard' AND d.usr = ${address(user)}
 GROUP BY d.key, d.title, d.updated_at
 ORDER BY d.updated_at DESC, d.key`
}

export function myWidgetsSql(wallet: string, user: string): string {
  return `${dashCte(wallet)}
 SELECT key, name, chart, expires_at, updated_at FROM dash
 WHERE type = 'widget' AND ${mineSql('dash', user)}
 ORDER BY expires_at, key`
}

export function activityCountsSql(wallet: string, user: string): string {
  return `${dashCte(wallet)}, mine AS (
 SELECT * FROM dash WHERE ${mineSql('dash', user)} AND type IN ('widget', 'dashboard')
 ), days AS (
 SELECT floor(created_at / 43200) AS day FROM mine
 UNION
 SELECT floor(updated_at / 43200) AS day FROM mine
 )
 SELECT
 (SELECT count(*) FROM mine WHERE type = 'widget') AS live_widgets,
 (SELECT count(*) FROM mine WHERE type = 'dashboard') AS live_dashboards,
 (SELECT count(*) FROM dash l JOIN mine w ON w.type = 'widget' AND w.key = l.widget
  WHERE l.type = 'link') AS placements,
 (SELECT count(*) FROM days) AS active_days`
}

export function expiringSoonSql(wallet: string, user: string): string {
  return `${dashCte(wallet)}
 SELECT key, type, CASE WHEN type = 'widget' THEN name ELSE title END AS label, expires_at
 FROM dash WHERE ${mineSql('dash', user)} AND type IN ('widget', 'dashboard')
 AND expires_at <= (SELECT block FROM live_head) + 43200
 ORDER BY expires_at, key LIMIT 10`
}

export function recentSql(wallet: string, user: string): string {
  return `${dashCte(wallet)}
 SELECT key, type, CASE WHEN type = 'widget' THEN name ELSE title END AS label,
 CASE WHEN created_at = updated_at THEN 'Created' ELSE 'Patched' END AS kind, updated_at
 FROM dash WHERE ${mineSql('dash', user)} AND type IN ('widget', 'dashboard')
 ORDER BY updated_at DESC, key LIMIT 10`
}

export type DashboardListQuery = { search: string; sort: 'newest' | 'oldest' | 'widgets' | 'expiring'; official: boolean; limit: number; offset: number }
// DuckDB WASM returns LIST columns as Arrow vectors, not plain arrays.
export function listValue(value: unknown): unknown[] {
 if (Array.isArray(value)) return value
 if (value && typeof (value as { toArray?: unknown }).toArray === 'function') return Array.from((value as { toArray(): ArrayLike<unknown> }).toArray())
 if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function' && typeof value !== 'string') return Array.from(value as Iterable<unknown>)
 return []
}
export type DashboardListItem = { key: string; title: string; user: string; official: boolean; widgets: number; charts: import('./schema').ChartType[]; createdAt: number; updatedAt: number; expiresAt: number }
function dashboardFilters(wallet: string, q: Pick<DashboardListQuery, 'search' | 'official'>): string {
 const filters = ["d.type = 'dashboard'"]
 if (q.official) filters.push(officialSql('d', wallet))
 if (q.search) {
  const term = q.search.toLowerCase()
  const literal = term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
  const title = `lower(d.title) LIKE ${quote('%' + literal + '%')} ESCAPE '\\'`
  filters.push(/^0x[0-9a-f]{0,40}$/i.test(term) ? `(${title} OR d.usr LIKE ${quote(term + '%')})` : `(${title})`)
 }
 return filters.join(' AND ')
}
export function dashboardListSql(wallet: string, q: DashboardListQuery): string {
 for (const n of [q.limit, q.offset]) if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid pagination')
 const order = { newest: 'd.created_at DESC', oldest: 'd.created_at ASC', widgets: 'widgets DESC', expiring: 'd.expires_at ASC' }[q.sort]
 if (!order) throw new Error('Invalid sort')
 return `${dashCte(wallet)}
 SELECT d.key, d.title, d.usr, ${officialSql('d', wallet)} AS official,
 count(DISTINCT l.key) AS widgets, list(DISTINCT w.chart ORDER BY w.chart) FILTER (WHERE w.chart IS NOT NULL) AS charts,
 d.created_at, d.updated_at, d.expires_at
 FROM dash d LEFT JOIN dash l ON l.type = 'link' AND l.dashboard = d.key
 LEFT JOIN dash w ON w.type = 'widget' AND w.key = l.widget
 WHERE ${dashboardFilters(wallet, q)}
 GROUP BY d.key, d.title, d.usr, d.owner, d.created_at, d.updated_at, d.expires_at
 ORDER BY ${order}, d.key LIMIT ${q.limit} OFFSET ${q.offset}`
}
export function dashboardCountSql(wallet: string, q: Pick<DashboardListQuery, 'search' | 'official'>): string {
 return `${dashCte(wallet)} SELECT count(*) AS n FROM dash d WHERE ${dashboardFilters(wallet, q)}`
}
export function toDashboardItems(rows: unknown[][]): DashboardListItem[] {
 return rows.map(([key, title, user, official, widgets, charts, createdAt, updatedAt, expiresAt]) => ({ key: String(key).toLowerCase(), title: String(title), user: String(user).toLowerCase(), official: official === true || official === 1 || official === BigInt(1) || official === 'true', widgets: Number(widgets), charts: listValue(charts).map(String) as DashboardListItem['charts'], createdAt: Number(createdAt), updatedAt: Number(updatedAt), expiresAt: Number(expiresAt) }))
}

export function widgetDashboardsSql(wallet: string, widgetKey: string, limit: number): string {
 if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('Invalid pagination')
 return `${dashCte(wallet)}
 SELECT d.key, d.title, d.usr, count(DISTINCT all_links.key) AS widgets, d.owner
 FROM dash d LEFT JOIN dash all_links ON all_links.type = 'link' AND all_links.dashboard = d.key
 AND all_links.expires_at > (SELECT block FROM live_head)
 WHERE d.type = 'dashboard' AND d.expires_at > (SELECT block FROM live_head)
 AND EXISTS (SELECT 1 FROM dash l WHERE l.type = 'link' AND l.dashboard = d.key
 AND l.widget = ${entityKey(widgetKey)} AND l.expires_at > (SELECT block FROM live_head))
 GROUP BY d.key, d.title, d.usr, d.owner
 ORDER BY ${officialSql('d', wallet)} DESC, d.title, d.key LIMIT ${limit}`
}
export function toUsedOn(rows: unknown[][], wallet: string): { key: string; title: string; user: string; official: boolean; widgets: number }[] {
 return rows.map(([key, title, user, widgets, owner]) => ({ key: String(key).toLowerCase(), title: String(title), user: String(user).toLowerCase(), official: isOfficialOwned(String(user).toLowerCase(), String(owner).toLowerCase(), wallet), widgets: Number(widgets) }))
}
