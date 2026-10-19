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
