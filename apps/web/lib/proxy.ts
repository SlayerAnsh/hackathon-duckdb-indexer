const requestHeaders = ['range', 'if-none-match', 'if-modified-since']
const responseHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'cache-control']

export async function proxy(req: Request, path: string[], base: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const allowed = (path.length === 1 && ['manifest.json', 'delta.json', 'health'].includes(path[0]))
    || (path.length === 3 && path[0] === 'snap' && /^v\d+$/.test(path[1]) && ['entities.parquet', 'attributes.parquet'].includes(path[2]))
  if (!allowed) return new Response(null, { status: 404 })
  const headers = new Headers()
  for (const name of requestHeaders) {
    const value = req.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  try {
    const upstream = await fetchImpl(base.replace(/\/$/, '') + '/' + path.join('/'), {
      method: req.method, headers, cache: 'no-store', redirect: 'manual', signal: req.signal,
    })
    const returned = new Headers()
    for (const name of responseHeaders) {
      const value = upstream.headers.get(name)
      if (value !== null) returned.set(name, value)
    }
    return new Response(req.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: returned })
  } catch {
    return new Response(req.method === 'HEAD' ? null : 'indexer unavailable', { status: 502 })
  }
}
