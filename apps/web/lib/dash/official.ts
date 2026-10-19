import { addr } from '@arkiv-network/sdk/attr'
import { and, eq, render } from '@arkiv-network/sdk/query'
import { DASH_PROJECT, isHexAddress } from './schema'

export const OFFICIAL_LOGIN = 'arkiv'
export const OFFICIAL_AUTHOR = 'Arkiv SQL Indexer'
export const OFFICIAL_KEEP_DAYS = 30
export function isOfficialUser(user: string, wallet: string): boolean {
  return isHexAddress(user) && isHexAddress(wallet) && user.toLowerCase() === wallet.toLowerCase()
}
export function officialExpr(wallet: string): string {
  if (!isHexAddress(wallet)) throw new Error('Invalid address')
  const publisher = addr(wallet.toLowerCase() as `0x${string}`)
  return render(and(eq('$creator', publisher), eq('project', DASH_PROJECT), eq('user', publisher)))
}
