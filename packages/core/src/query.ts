import { key } from '@arkiv-network/sdk/attr'
import { eq, or, render } from '@arkiv-network/sdk/query'
export function keyChunkQueries(expression: string | null, keys: string[], chunkSize = 50): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('chunkSize must be a positive integer')
  const queries: string[] = []
  for (let i = 0; i < keys.length; i += chunkSize) {
    const terms = render(or(...keys.slice(i, i + chunkSize).map(k => eq('$key', key(k as `0x${string}`)))))
    queries.push(expression === null ? terms : `(${expression}) AND (${terms})`)
  }
  return queries
}
export function ownerTerms(expression: string): { creators: string[]; owners: string[] } {
  const creators: string[] = [], owners: string[] = []
  // This is only a relevance prefilter: false positives are fine, false negatives are not.
  // Scan raw text, including quoted strings, rather than attempting to interpret boolean logic.
  const pattern = /\$(creator|owner)\s*=\s*addr\(\s*(0x[0-9a-f]+)\s*\)/gi
  for (const match of expression.matchAll(pattern)) {
    ;(match[1]!.toLowerCase() === 'creator' ? creators : owners).push(match[2]!.toLowerCase())
  }
  return { creators, owners }
}
export function hasCreatorTerm(expression: string): boolean {
  return ownerTerms(expression).creators.length > 0
}
