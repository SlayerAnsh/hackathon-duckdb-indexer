import { getDashDeps } from '../../../../../../lib/dash/server/deps'
import { withDeps } from '../../../../../../lib/dash/server/routes'
import { handleOrganize } from '../../../../../../lib/dash/server/routes'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  return withDeps(getDashDeps(), deps => handleOrganize(req, deps, key))
}
