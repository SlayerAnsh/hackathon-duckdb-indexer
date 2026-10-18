import { encodeEventTopics, encodeAbiParameters } from 'viem'
import { ENTITY_EVENTS_ABI, type RawLog } from '@asi/core'
import { hash } from './helpers'
const key = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as `0x${string}`
export function event(n: number, kind: 'EntityCreated' | 'ExpiryExtended' | 'EntityDeleted' | 'EntityPatched', block: number, expiry = 100): RawLog {
  const owner = '0x0000000000000000000000000000000000000001'
  return { topics: encodeEventTopics({ abi: ENTITY_EVENTS_ABI, eventName: kind, args: { entityKey: key(n), owner } }) as string[],
    data: kind === 'EntityCreated' ? encodeAbiParameters([{ type: 'uint64' }, { type: 'uint8' }], [BigInt(expiry), 0]) : kind === 'ExpiryExtended' ? encodeAbiParameters([{ type: 'uint64' }], [BigInt(expiry)]) : '0x',
    blockNumber: block, logIndex: n, transactionHash: hash }
}
