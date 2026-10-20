import { createRpc } from '@asi/core'

// Browser reads go through the same origin read proxy (/api/rpc), which adds the server side
// API key. Outside a browser (tests, server code) the given URL is used as is.
export const RPC_PROXY_PATH = '/api/rpc'
export function browserRpcUrl(url: string): string {
  const origin = typeof window !== 'undefined' ? window.location?.origin : undefined
  return origin ? new URL(RPC_PROXY_PATH, origin).toString() : url
}
export function createBrowserRpc(url: string) {
  return createRpc(browserRpcUrl(url))
}
