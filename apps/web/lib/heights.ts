import { blockAge } from './format'
export type HeightItem = {label:string;block:number}
// Attributes fill newest first, so every entity changed after the newest pending one is complete.
// Returns 0 (genesis) once nothing is pending.
export const OLDEST_SQL = 'SELECT coalesce(max(updated_at) FILTER (WHERE attrs_pending) + 1, 0) AS oldest FROM entities'
export const heightText = (i: HeightItem) => i.label==='from' && i.block===0 ? 'genesis' : i.block.toLocaleString()
export function describeHeights(h: { chain?: number; stored?: number; snapshot?: number; serving?: number; oldest?: number; source?: 'indexer' | 'disk' }): { items: HeightItem[]; lagBlocks?:number; lagText?:string; state:'live'|'behind'|'stale'|'unknown' } {
 const items: HeightItem[] = []
 if(h.oldest !== undefined) items.push({label:'from',block:h.oldest})
 if(h.stored !== undefined) items.push({label:'stored',block:h.stored})
 if(h.serving !== undefined && h.serving !== h.stored) items.push({label:'serving',block:h.serving})
 if(h.chain !== undefined) items.push({label:'chain',block:h.chain})
 const available = [h.stored,h.serving].filter((v): v is number => v !== undefined)
 if(h.chain === undefined || !available.length) return {items,state:'unknown'}
 const lagBlocks = Math.max(0,h.chain-Math.max(...available))
 return {items,lagBlocks,lagText:lagBlocks>1800 ? `${(lagBlocks/1800).toFixed(1)} h behind` : `${lagBlocks} blocks (${blockAge(0,lagBlocks)})`,state:lagBlocks<=10?'live':lagBlocks<=1800?'behind':'stale'}
}
