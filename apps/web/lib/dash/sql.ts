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

export function dashCte(wallet: string): string {
  return `WITH dash AS (
 SELECT e.key, e.created_at, e.updated_at, e.expires_at,
  max(a.value) FILTER (WHERE a.name = 'type') AS type,
  max(a.value) FILTER (WHERE a.name = 'user') AS usr,
  max(a.value) FILTER (WHERE a.name = 'login') AS login,
  max(a.value) FILTER (WHERE a.name = 'name') AS name,
  max(a.value) FILTER (WHERE a.name = 'title') AS title,
  max(a.value) FILTER (WHERE a.name = 'chart') AS chart,
  max(a.value) FILTER (WHERE a.name = 'dashboard') AS dashboard,
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
export type WidgetListItem = { key: string; name: string; chart: import('./schema').ChartType; user: string; expiresAt: number; createdAt: number; uses: number }

function widgetFilters(q: Pick<WidgetListQuery, 'search' | 'chart' | 'user'>): string {
 const filters = ["w.type = 'widget'"]
 if (q.chart !== null) filters.push(`w.chart = ${quote(q.chart)}`)
 if (q.user !== null) filters.push(`w.usr = ${address(q.user)}`)
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
 SELECT w.key, w.name, w.chart, w.usr, w.expires_at, w.created_at, count(DISTINCT l.dashboard) AS uses
 FROM dash w LEFT JOIN dash l ON l.type = 'link' AND l.widget = w.key
 WHERE ${widgetFilters(q)}
 GROUP BY w.key, w.name, w.chart, w.usr, w.expires_at, w.created_at
 ORDER BY ${order}, w.key
 LIMIT ${q.limit} OFFSET ${q.offset}`
}

export function widgetCountSql(wallet: string, q: Omit<WidgetListQuery, 'sort' | 'limit' | 'offset'>): string {
 return `${dashCte(wallet)} SELECT count(*) AS n FROM dash w WHERE ${widgetFilters(q)}`
}
