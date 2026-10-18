import { open, readFile, readdir, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'

// Same allow list as the indexer HTTP handler and the proxy.
export function allowedPath(path: string[]): boolean {
  return (path.length === 1 && ['manifest.json', 'delta.json', 'health'].includes(path[0]!))
    || (path.length === 3 && path[0] === 'snap' && /^v\d+$/.test(path[1]!) && ['entities.parquet', 'attributes.parquet'].includes(path[2]!))
}

const missing = (error: unknown) => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')

async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (missing(error)) return null; throw error }
}

// Mirrors the indexer's paused serving rule: active-generation.json if present, else the single <chainId>-<hash> store holding manifest.json.
export async function resolveStoreDir(dataDir: string): Promise<string | null> {
  let entries: string[]
  try { entries = await readdir(dataDir) }
  catch (error) { if (missing(error)) return null; throw error }
  const candidates: string[] = []
  for (const entry of entries.filter(name => /^\d+-0x[0-9a-f]+$/i.test(name))) {
    const base = join(dataDir, entry)
    let dir = base
    const generation = await readJson(join(base, 'active-generation.json')).catch(() => null)
    if (Number.isSafeInteger(generation) && (generation as number) >= 1) dir += '-g' + generation
    if (await readJson(join(dir, 'manifest.json')).catch(() => null)) candidates.push(dir)
  }
  return candidates.length === 1 ? candidates[0]! : null
}

const notFound = () => new Response(null, { status: 404 })

export async function serveFromDisk(req: Request, path: string[], dataDir: string): Promise<Response> {
  if (!allowedPath(path)) return notFound()
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 })
  const dir = await resolveStoreDir(dataDir)
  if (!dir) return Response.json({ error: 'no indexed data' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  if (path[0] === 'health') {
    const manifest = await readJson(join(dir, 'manifest.json')).catch(() => null) as { headBlock?: number; snapshotBlock?: number } | null
    const delta = await readJson(join(dir, 'delta.json')).catch(() => null) as { toBlock?: number } | null
    return Response.json({ source: 'disk', headBlock: delta?.toBlock ?? manifest?.headBlock ?? null, lastSnapshot: manifest?.snapshotBlock ?? null },
      { headers: { 'cache-control': 'no-store', 'x-served-by': 'disk' } })
  }
  const parquet = path[0] === 'snap'
  let real: string
  try {
    const rootReal = await realpath(dataDir)
    real = await realpath(join(/*turbopackIgnore: true*/ dir, ...path))
    if (!real.startsWith(rootReal + sep)) return notFound()
  } catch (error) { if (missing(error)) return notFound(); throw error }
  let file
  try { file = await open(real, 'r') }
  catch (error) { if (missing(error) || (error as NodeJS.ErrnoException).code === 'EISDIR') return notFound(); throw error }
  try {
    const stat = await file.stat()
    if (!stat.isFile()) return notFound()
    // Header values match apps/indexer/src/http.ts.
    const headers = new Headers({
      'content-type': parquet ? 'application/vnd.apache.parquet' : 'application/json',
      'cache-control': parquet ? 'public, max-age=300, immutable' : 'no-cache',
      etag: `"${stat.size}-${stat.mtimeMs}"`,
      'x-served-by': 'disk',
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
