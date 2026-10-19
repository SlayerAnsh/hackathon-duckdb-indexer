import type { RpcEntity } from '@asi/core'
import { emptyWidget, DASH_PROJECT, type WidgetPayload } from '../lib/dash/schema'
import type { OpsDeps, DashWriterClient } from '../lib/dash/server/operations'
import { WriteQueue } from '../lib/dash/server/queue'

export type RpcRow = RpcEntity
export const W = `0x${'1a'.repeat(20)}` as const
export const U = `0x${'2b'.repeat(20)}` as const
export const OTHER = `0x${'3c'.repeat(20)}` as const
export const K = `0x${'11'.repeat(32)}` as const
export const D = `0x${'22'.repeat(32)}` as const
export const PREDICTED_1 = `0x${'a1'.padStart(64, '0')}` as const
export const PREDICTED_2 = `0x${'a2'.padStart(64, '0')}` as const
export const validWidget: WidgetPayload = { ...emptyWidget(), name: 'Top 10 creators', sql: 'SELECT creator, count(*) AS n FROM entities GROUP BY 1 ORDER BY n DESC LIMIT 10', chart: 'hbar', mapping: { x: 'creator', y: ['n'], groupBy: null, stacking: 'off', sort: 'query' } }
type RowOptions = { owner?: string; key?: string; user?: string; expiresAt?: number; creator?: string }
function row(type: string, attrs: Record<string, string>, payload: object, options: RowOptions): RpcRow {
  return { key: (options.key ?? K) as `0x${string}`, owner: (options.owner ?? W) as `0x${string}`, creator: (options.creator ?? W) as `0x${string}`, createdAt: '0x1', updatedAt: '0x2', expiresAt: `0x${(options.expiresAt ?? 5000).toString(16)}`,
    attributes: Object.entries({ type, project: DASH_PROJECT, user: options.user ?? U, ...attrs }).map(([name, value]) => ({ name, value, type: name === 'user' ? 'addr' : ['dashboard', 'widget'].includes(name) ? 'key' : 'str' })),
    payload: `0x${Buffer.from(JSON.stringify(payload)).toString('hex')}` }
}
export function widgetRow(options: RowOptions & { widget?: WidgetPayload } = {}): RpcRow {
  const widget = options.widget ?? validWidget
  return row('widget', { login: 'google', name: widget.name, chart: widget.chart }, widget, options)
}
export function dashboardRow(options: RowOptions = {}): RpcRow {
  return row('dashboard', { login: 'google', title: 'Overview' }, { v: 1, title: 'Overview', description: '' }, { key: D, ...options })
}
export function linkRow(options: RowOptions & { dashboard?: string; widget?: string; position?: number } = {}): RpcRow {
  return row('link', { dashboard: options.dashboard ?? D, widget: options.widget ?? K }, { v: 1, size: 'md', position: options.position ?? 0, name: validWidget.name }, { key: `0x${'33'.repeat(32)}`, ...options })
}
export function fakeChain(entities: RpcRow[], head = 1000) {
  const calls: { method: string; data: any }[] = []
  const queries: string[] = []
  const record = (method: string) => async (data: any) => {
    calls.push({ method, data })
    return { txHash: '0xtx', entityKey: PREDICTED_1, createdEntities: [PREDICTED_1, PREDICTED_2], expiresAt: BigInt(0) }
  }
  const client = { account: { address: W }, createEntity: record('create'), patchEntity: record('patch'), extendEntity: record('extend'), deleteEntity: record('delete'), executeBatch: async (data: any) => {
      const result = await record('batch')(data)
      for (const extension of data.extensions ?? []) {
        const entity = entities.find(e => e.key === extension.entityKey)
        if (entity) entity.expiresAt = `0x${extension.expires.expiresAt.toString(16)}`
      }
      return result
    },
    predictEntityKeys: async ({ count = 2 }: { count?: number }) => Array.from({ length: count }, (_, i) => ({
      key: `0x${(0xa1 + i).toString(16).padStart(64, '0')}` as `0x${string}`, salt: BigInt(i + 1),
    })) } as unknown as DashWriterClient
  const deps: OpsDeps = { client, wallet: W, queue: new WriteQueue(), reader: {
    query: async expression => { queries.push(expression); return { data: entities, blockNumber: head } }, blockNumber: async () => head,
  } }
  return { deps, calls, queries }
}

export function officialWidgetRow(options: Parameters<typeof widgetRow>[0] = {}): RpcRow {
  const result = widgetRow({ user: W, ...options })
  result.attributes = result.attributes!.map(a => a.name === 'login' ? { ...a, value: 'arkiv' } : a)
  return result
}
export function officialDashboardRow(slug = 'network-overview', options: RowOptions = {}): RpcRow {
  const result = dashboardRow({ user: W, ...options })
  result.attributes = [...result.attributes!.map(a => a.name === 'login' ? { ...a, value: 'arkiv' } : a), { name: 'slug', value: slug, type: 'str' }]
  return result
}
