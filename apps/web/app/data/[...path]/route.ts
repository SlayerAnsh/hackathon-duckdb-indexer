import { proxy } from '@/lib/proxy'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await context.params).path, process.env.INDEXER_URL ?? 'http://indexer:8080', fetch, process.env.DATA_DIR || undefined)
}

export const HEAD = GET
