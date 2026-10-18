import { createRpc } from '@asi/core'

// Public RPC only: credentials stay on the server.
export function createBrowserRpc(url: string) {
  return createRpc(url)
}
