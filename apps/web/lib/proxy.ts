import { allowedPath, serveFromDisk } from './disk-data'

const requestHeaders = ['range', 'if-none-match', 'if-modified-since']
const responseHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'cache-control']
const unavailable = [502, 503, 504]

// Proxies to the indexer first; with dataDir set, serves the stored files from disk when the indexer is unreachable.
export async function proxy(req: Request, path: string[], base: string, fetchImpl: typeof fetch = fetch, dataDir?: string): Promise<Response> {
  if (!allowedPath(path)) return new Response(null, { status: 404 })
  const headers = new Headers()
  for (const name of requestHeaders) {
    const value = req.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  let upstream: Response
  try {
    upstream = await fetchImpl(base.replace(/\/$/, '') + '/' + path.join('/'), {
      method: req.method, headers, cache: 'no-store', redirect: 'manual', signal: req.signal,
    })
  } catch {
    if (dataDir) return serveFromDisk(req, path, dataDir)
    return new Response(req.method === 'HEAD' ? null : 'indexer unavailable', { status: 502 })
  }
  if (dataDir && unavailable.includes(upstream.status)) {
    await upstream.body?.cancel().catch(() => {})
    return serveFromDisk(req, path, dataDir)
  }
  const returned = new Headers()
  for (const name of responseHeaders) {
    const value = upstream.headers.get(name)
    if (value !== null) returned.set(name, value)
  }
  return new Response(req.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: returned })
}
