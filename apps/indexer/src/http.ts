import { open } from 'node:fs/promises'
import { join } from 'node:path'
export function bootstrappingHandler(): (req: Request) => Promise<Response> {
  return async req => {
    const path = new URL(req.url).pathname
    if (path === '/health') return Response.json({ bootstrapping: true, headBlock: null, headLag: null, lastSnapshot: null }, { headers: { 'cache-control': 'no-store' } })
    return new Response(null, { status: path === '/manifest.json' || path === '/delta.json' || /^\/snap\/v\d+\/(entities|attributes)\.parquet$/.test(path) ? 503 : 404 })
  }
}
export function createHandler(dir: string, health: () => object): (req: Request) => Promise<Response> {
  return async req => {
    const path = new URL(req.url).pathname
    if (path === '/health') return Response.json(health())
    const parquet = /^\/snap\/v\d+\/(entities|attributes)\.parquet$/.test(path)
    if (!parquet && path !== '/manifest.json' && path !== '/delta.json') return new Response(null, { status: 404 })
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 })
    let file
    try { file = await open(join(dir, path.slice(1)), 'r') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 }); throw error }
    try {
      const stat = await file.stat()
      const headers = new Headers({
        'content-type': parquet ? 'application/vnd.apache.parquet' : 'application/json',
        'cache-control': parquet ? 'public, max-age=300, immutable' : 'no-cache',
        etag: `"${stat.size}-${stat.mtimeMs}"`,
      })
      if (req.headers.get('if-none-match') === headers.get('etag')) return new Response(null, { status: 304, headers })
      if (parquet) headers.set('accept-ranges', 'bytes')
      let start = 0, end = stat.size - 1, status = 200
      const range = parquet ? req.headers.get('range') : null
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (match && (match[1] || match[2])) {
          start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]))
          end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end
        } else start = stat.size
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
          headers.set('content-range', `bytes */${stat.size}`)
          return new Response(null, { status: 416, headers })
        }
        status = 206; headers.set('content-range', `bytes ${start}-${end}/${stat.size}`)
      }
      const length = Math.max(0, end - start + 1)
      headers.set('content-length', String(length))
      if (req.method === 'HEAD') return new Response(null, { status, headers })
      const bytes = new Uint8Array(length)
      let read = 0
      while (read < length) {
        const result = await file.read(bytes, read, length - read, start + read)
        if (result.bytesRead === 0) throw Error('File changed during read')
        read += result.bytesRead
      }
      return new Response(bytes, { status, headers })
    } finally { await file.close() }
  }
}
export function serve(port: number, handler: (req: Request) => Promise<Response>): { stop(): void } {
  const server = Bun.serve({ port, fetch: handler })
  return { stop() { server.stop() } }
}
