import type { RpcEntity } from './types'
export type { RpcEntity } from './types'
export type RpcSelect = {
  key?: boolean; owner?: boolean; creator?: boolean; createdAt?: boolean
  updatedAt?: boolean; expiresAt?: boolean; creationFlags?: boolean; contentType?: boolean
  payload?: boolean; attributes?: boolean
}
export type QueryPage = { data: RpcEntity[]; blockNumber: number; cursor?: string }
export type RawLog = { topics: string[]; data: string; blockNumber: number; logIndex: number; transactionHash: string }
export interface ArkivRpc {
  query(expression: string, opts: { atBlock?: number; cursor?: string; limit?: number; select: RpcSelect }): Promise<QueryPage>
  blockNumber(): Promise<number>
  chainId(): Promise<number>
  genesisHash(): Promise<string>
  blockHash(block: number): Promise<string>
  getLogs(fromBlock: number, toBlock: number): Promise<RawLog[]>
}
export const ROW_SELECT: RpcSelect = {
  key: true, owner: true, creator: true, createdAt: true, updatedAt: true,
  expiresAt: true, creationFlags: true, contentType: true, attributes: true,
}
export class RpcError extends Error {
  constructor(message: string, public status: number, public code: string | number, public retryAfter: string | null = null) {
    super(message); this.name = 'RpcError'
  }
}
const hex = (n: number) => `0x${n.toString(16)}`
export function createRpc(url: string, opts: {
  apiKey?: string; fetchImpl?: typeof fetch
  onCost?: (cost: number, quotaUsedPercent: number | null) => void
} = {}): ArkivRpc {
  let id = 0
  async function request<T>(method: string, params: unknown[]): Promise<T> {
    const response = await (opts.fetchImpl ?? fetch)(url, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    })
    const cost = response.headers.get('arkiv-cost')
    const quota = response.headers.get('arkiv-quota-used-percent')
    if (cost !== null) opts.onCost?.(Number(cost), quota === null ? null : Number(quota))
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch {
      throw new RpcError(response.statusText || 'Invalid RPC response', response.status, response.ok ? 'INVALID_RESPONSE' : response.status)
    }
    if (!response.ok || body.error !== undefined) {
      const error = body.error
      throw new RpcError(
        (typeof error === 'object' && error !== null ? error.message : body.message) ?? response.statusText ?? 'RPC error',
        response.status,
        (typeof error === 'object' && error !== null ? error.code : error) ?? response.status,
        response.headers.get('retry-after'),
      )
    }
    return body.result as T
  }
  return {
    async query(expression, options) {
      const { atBlock, limit, ...rest } = options
      const page = await request<{ data: RpcEntity[]; blockNumber: string; cursor?: string }>('arkiv_query', [expression, {
        ...rest, ...(atBlock !== undefined ? { atBlock: hex(atBlock) } : {}), ...(limit !== undefined ? { limit: hex(limit) } : {}),
      }])
      return { ...page, blockNumber: Number(page.blockNumber) }
    },
    async blockNumber() { return Number(await request<string>('eth_blockNumber', [])) },
    async chainId() { return Number(await request<string>('eth_chainId', [])) },
    async genesisHash() { return (await request<{ hash: string }>('eth_getBlockByNumber', ['0x0', false])).hash },
    async blockHash(block) {
      const header = await request<{ hash: string } | null>('eth_getBlockByNumber', [hex(block), false])
      if (!header?.hash) throw new RpcError('Block hash unavailable', 200, 'BLOCK_UNAVAILABLE')
      return header.hash.toLowerCase()
    },
    async getLogs(fromBlock, toBlock) {
      const logs = await request<(Omit<RawLog, 'blockNumber' | 'logIndex'> & { blockNumber: string; logIndex: string })[]>('eth_getLogs', [{
        address: '0x4400000000000000000000000000000000000044', fromBlock: hex(fromBlock), toBlock: hex(toBlock),
      }])
      return logs.map(log => ({ ...log, blockNumber: Number(log.blockNumber), logIndex: Number(log.logIndex) }))
    },
  }
}
