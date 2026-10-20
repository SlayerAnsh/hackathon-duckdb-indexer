import { listValue } from './sql'
import type { ChartType } from './schema'
import { blockAge } from '../format'
import type { PendingWrite } from './pending'
import type { WidgetListItem } from './sql'

export type HomeDashboard = { key: string; title: string; widgets: number; updatedAt: number | null; syncing: boolean; cover?: string | null; charts?: ChartType[]; expiresAt?: number }
export function mergeDashboards(rows: unknown[][], pending: PendingWrite[]): HomeDashboard[] {
 const writes = pending.filter(w => w.kind === 'dashboard')
 const deleted = new Set(writes.filter(w => w.op === 'delete').map(w => w.key.toLowerCase()))
 const indexed = rows.map(([key, title, widgets, updatedAt, cover, charts, expiresAt]) => ({ key: String(key).toLowerCase(), title: String(title), widgets: Number(widgets), updatedAt: updatedAt == null ? null : Number(updatedAt), syncing: false, ...(cover === undefined ? {} : { cover: cover == null ? null : String(cover), charts: listValue(charts).map(String) as ChartType[] }), ...(expiresAt == null ? {} : { expiresAt: Number(expiresAt) }) }))
 const keys = new Set(indexed.map(row => row.key))
 return [...writes.filter(w => w.op === 'upsert' && !keys.has(w.key.toLowerCase()) && typeof w.fields?.title === 'string').sort((a, b) => b.at - a.at).map(w => ({ key: w.key.toLowerCase(), title: String(w.fields!.title), widgets: 0, updatedAt: null, syncing: true })), ...indexed].filter(row => !deleted.has(row.key))
}
export function editedAgo(updatedAt: number | null, head?: number): string {
 return updatedAt === null || head === undefined ? 'edited just now' : `edited ${blockAge(updatedAt, head).replaceAll(' ', '')} ago`
}
/** myWidgetsSql rows as the shared Explore card item; owner and author fall back to the signed in address. */
export function homeWidgetItems(rows: unknown[][], address: string): WidgetListItem[] {
 return rows.map(([key, name, chart, expiresAt, updatedAt, user, createdAt, owner, uses]) => ({ key: String(key).toLowerCase(), name: String(name), chart: chart as WidgetListItem['chart'], user: String(user ?? address).toLowerCase(), owner: String(owner ?? address).toLowerCase(), expiresAt: Number(expiresAt), createdAt: Number(createdAt ?? 0), updatedAt: Number(updatedAt ?? 0), uses: Number(uses ?? 0) }))
}
