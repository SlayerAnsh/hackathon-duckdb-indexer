import { encodeEventTopics, encodeAbiParameters } from 'viem'
import { ENTITY_EVENTS_ABI, type RawLog } from '@asi/core'
import { hash } from './helpers'
const key = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as `0x${string}`
export const addr = (n: number) => ('0x' + n.toString(16).padStart(40, '0')) as `0x${string}`
type Kind = 'EntityCreated' | 'ExpiryExtended' | 'EntityDeleted' | 'EntityPatched' | 'OwnershipTransferred'
export function event(n: number, kind: Kind, block: number, expiry: number | bigint = 100, opts: { owner?: `0x${string}`; newOwner?: `0x${string}`; flags?: number; logIndex?: number } = {}): RawLog {
  const owner = opts.owner ?? addr(1)
  const args = kind === 'OwnershipTransferred' ? { entityKey: key(n), previousOwner: owner, newOwner: opts.newOwner ?? addr(2) } : { entityKey: key(n), owner }
  return { topics: encodeEventTopics({ abi: ENTITY_EVENTS_ABI, eventName: kind, args } as any) as string[],
    data: kind === 'EntityCreated' ? encodeAbiParameters([{ type: 'uint64' }, { type: 'uint8' }], [BigInt(expiry), opts.flags ?? 0]) : kind === 'ExpiryExtended' ? encodeAbiParameters([{ type: 'uint64' }], [BigInt(expiry)]) : '0x',
    blockNumber: block, logIndex: opts.logIndex ?? n, transactionHash: hash }
}
