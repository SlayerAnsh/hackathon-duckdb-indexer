import { BLOCKS_PER_DAY, MAX_REMAINING_DAYS } from './schema'

export function timeLeftLabel(expiresAt: number, head: number): { text: string; tone: 'live' | 'warn' | 'expired' } {
  const remaining = expiresAt - head
  if (remaining <= 0) return { text: 'Expired', tone: 'expired' }
  const hours = Math.floor(remaining / (BLOCKS_PER_DAY / 24))
  if (remaining < BLOCKS_PER_DAY) {
    const text = hours >= 1 ? `${hours}h` : `${Math.floor(remaining / (BLOCKS_PER_DAY / 1440))}m`
    return { text: `Expires in ${text}`, tone: 'warn' }
  }
  return { text: `${Math.floor(remaining / BLOCKS_PER_DAY)}d ${hours % 24}h left`, tone: 'live' }
}

export function extendPreview(expiresAt: number, head: number, lifetimeDays: number): { daysAdded: number; atCap: boolean } {
  const target = Math.min(expiresAt + lifetimeDays * BLOCKS_PER_DAY, head + MAX_REMAINING_DAYS * BLOCKS_PER_DAY)
  return { daysAdded: Math.floor((target - expiresAt) / BLOCKS_PER_DAY), atCap: target <= expiresAt }
}
