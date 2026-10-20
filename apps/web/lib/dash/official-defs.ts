import { emptyWidget, type ChartType, type Size, type WidgetPayload } from './schema'
import { VIEWS, HEAD_SQL, bucketedSql } from '../views'
import { FIGURE_SQL } from '../../components/landing/stats'

export type OfficialWidgetDef = { size: Size; widget: WidgetPayload }
export type OfficialDashboardDef = { slug: string; title: string; description: string; widgets: OfficialWidgetDef[] }

function widget(name: string, chart: ChartType, size: Size, sql: string, x: string | null = null, y: string[] = [], groupBy: string | null = null): OfficialWidgetDef {
  const defaults = emptyWidget()
  return { size, widget: { ...defaults, name, sql, chart, lifetimeDays: 90,
    mapping: { ...defaults.mapping, x, y, groupBy, stacking: chart === 'stacked-bar' ? 'stack' : 'off', ...(chart === 'histogram' ? { bins: 20 } : {}) },
    counter: chart === 'counter' ? { column: 'value', row: 0, prefix: '', suffix: '', label: '', decimals: name === 'Median hours left' ? 1 : 0, compact: false } : null } }
}
function view(id: string, chart: ChartType, size: Size): OfficialWidgetDef {
  const source = VIEWS.flatMap(v => v.widgets).find(w => w.id === id)!
  return widget(source.title, chart, size, source.sql, source.x ?? null, Array.isArray(source.y) ? source.y : source.y ? [source.y] : [], source.series ?? null)
}
function counter(id: string, name: string): OfficialWidgetDef {
  const source = VIEWS.flatMap(v => v.widgets).find(w => w.id === id)!
  return widget(name, 'counter', 'xs', source.sql.replace(', count(*) AS total', ''))
}
// One dashboard per showcase view in lib/views.ts, in the same order.
export const OFFICIAL_DASHBOARDS: OfficialDashboardDef[] = [
  { slug: 'network-overview', title: 'Arkiv network overview', description: 'The live dataset at a glance: volume, creators, entity types and what expires next on the Tiramisu testnet.', widgets: [
    widget('Live entities', 'counter', 'xs', FIGURE_SQL.live),
    widget('Distinct creators', 'counter', 'xs', FIGURE_SQL.creators),
    counter('known', 'Known entities'), counter('owners-count', 'Distinct owners'),
    widget('Expiring within 1 hour', 'counter', 'xs', FIGURE_SQL.expiring),
    widget('Created in the last hour', 'counter', 'xs', FIGURE_SQL.created),
    widget('Creations per hour', 'area', 'md', bucketedSql('created_at', 43200, 1800), 'label', ['count']),
    view('types', 'donut', 'md'), view('recent', 'table', 'xl'),
  ] },
  { slug: 'expiry-watch', title: 'Expiry watch', description: 'How long live entities have left, by bucket and by type. One block is two seconds.', widgets: [
    counter('median', 'Median hours left'), counter('expiring-day', 'Expiring within 24 hours'), counter('long-lived', 'Living longer than 7 days'),
    widget('Hours left, sample of 5,000', 'histogram', 'md', `SELECT (expires_at::DOUBLE - ${HEAD_SQL}) / 1800 AS hours_left FROM entities ORDER BY hash(key) LIMIT 5000`, 'hours_left'),
    view('horizon', 'bar', 'md'), view('expiry-types', 'stacked-bar', 'xl'), view('next-expiry', 'table', 'xl'),
  ] },
  { slug: 'creators', title: 'Creators', description: "Who writes the most, who owns what, and how varied each creator's data is.", widgets: [
    widget("Largest creator's entities", 'counter', 'xs', 'SELECT max(n) AS value FROM (SELECT count(*) AS n FROM entities GROUP BY creator)'),
    counter('transfers', 'Entities transferred'), counter('single-creators', 'Creators with one entity'), counter('owners-count', 'Distinct owners'),
    view('top-creators', 'hbar', 'md'), view('creator-types', 'table', 'md'), view('creator-filter', 'table', 'xl'), view('transferred', 'table', 'xl'),
  ] },
  { slug: 'attributes', title: 'Attributes', description: 'Attribute names and values in use, their types, and numeric statistics.', widgets: [
    view('status', 'hbar', 'md'), view('priority', 'hbar', 'md'),
    view('attribute-usage', 'table', 'xl'), view('numeric', 'table', 'xl'),
  ] },
  { slug: 'activity', title: 'Activity', description: 'How entities change over time: updates, creates versus patches, and the running total.', widgets: [
    widget('Updates per 10 min', 'bar', 'md', bucketedSql('updated_at', 9000, 300), 'label', ['count']),
    view('modified', 'donut', 'md'), view('running', 'area', 'xl'),
  ] },
]
