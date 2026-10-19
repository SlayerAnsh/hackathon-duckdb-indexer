import { blockAge, shortHex } from '../format'
import type { ChartType } from './schema'
import type { SlotStatus } from './slots'

export function figureNumbers(slots: { id: string; status: SlotStatus; chart: ChartType | null }[]): Map<string, number> {
 const numbers = new Map<string, number>()
 for (const slot of slots) if (slot.status === 'live' && slot.chart !== null && slot.chart !== 'counter') numbers.set(slot.id, numbers.size + 1)
 return numbers
}
export function shareUrls(origin: string, key: string, title: string): { link: string; x: string } {
 const link = `${origin}/d/${key}`
 return { link, x: `https://x.com/intent/post?text=${encodeURIComponent(`${title}, a live report on Arkiv SQL Indexer`)}&url=${encodeURIComponent(link)}` }
}
export function menuIndex(key: string, index: number, count: number): number | 'close' | null {
 if (key === 'Escape') return 'close'
 if (count <= 0) return null
 switch (key) {
  case 'ArrowDown': return (index + 1) % count
  case 'ArrowUp': return (index - 1 + count) % count
  case 'Home': return 0
  case 'End': return count - 1
  default: return null
 }
}
export function updatedLabel(updatedAt: number, head: number): string { return `Updated ${blockAge(updatedAt, head)} ago` }
export function importedFrom(widgetUser: string, dashboardUser: string, wallet: string): string | null {
 if (widgetUser.toLowerCase() === dashboardUser.toLowerCase()) return null
 return 'Imported from ' + (widgetUser.toLowerCase() === wallet.toLowerCase() ? 'Arkiv SQL Indexer' : shortHex(widgetUser))
}
