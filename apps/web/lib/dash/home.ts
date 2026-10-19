import { blockAge } from '../format'
import type { PendingWrite } from './pending'

export type HomeDashboard = { key: string; title: string; widgets: number; updatedAt: number | null; syncing: boolean }
export function mergeDashboards(rows: unknown[][], pending: PendingWrite[]): HomeDashboard[] {
 const writes = pending.filter(w => w.kind === 'dashboard')
 const deleted = new Set(writes.filter(w => w.op === 'delete').map(w => w.key.toLowerCase()))
 const indexed = rows.map(([key, title, widgets, updatedAt]) => ({ key: String(key).toLowerCase(), title: String(title), widgets: Number(widgets), updatedAt: updatedAt == null ? null : Number(updatedAt), syncing: false }))
 const keys = new Set(indexed.map(row => row.key))
 return [...writes.filter(w => w.op === 'upsert' && !keys.has(w.key.toLowerCase()) && typeof w.fields?.title === 'string').sort((a, b) => b.at - a.at).map(w => ({ key: w.key.toLowerCase(), title: String(w.fields!.title), widgets: 0, updatedAt: null, syncing: true })), ...indexed].filter(row => !deleted.has(row.key))
}
export function editedAgo(updatedAt: number | null, head?: number): string {
 return updatedAt === null || head === undefined ? 'edited just now' : `edited ${blockAge(updatedAt, head).replaceAll(' ', '')} ago`
}
