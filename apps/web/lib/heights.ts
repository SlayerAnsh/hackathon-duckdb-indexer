import { blockAge } from './format'
export function describeHeights(h: { chain?: number; stored?: number; snapshot?: number; serving?: number; source?: 'indexer' | 'disk' }): { items: {label:string;block:number}[]; lagBlocks?:number; lagText?:string; state:'live'|'behind'|'stale'|'unknown' } {
 const items: {label:string;block:number}[] = []
 if(h.stored !== undefined) items.push({label:'stored',block:h.stored})
 if(h.serving !== undefined && h.serving !== h.stored) items.push({label:'serving',block:h.serving})
 if(h.chain !== undefined) items.push({label:'chain',block:h.chain})
 const available = [h.stored,h.serving].filter((v): v is number => v !== undefined)
 if(h.chain === undefined || !available.length) return {items,state:'unknown'}
 const lagBlocks = Math.max(0,h.chain-Math.max(...available))
 return {items,lagBlocks,lagText:lagBlocks>1800 ? `${(lagBlocks/1800).toFixed(1)} h behind` : `${lagBlocks} blocks (${blockAge(0,lagBlocks)})`,state:lagBlocks<=10?'live':lagBlocks<=1800?'behind':'stale'}
}
