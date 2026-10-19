import { getDashDeps } from '../../../../../lib/dash/server/deps'
import { withDeps } from '../../../../../lib/dash/server/routes'
import { handleUpdateDashboard, handleDeleteDashboard } from '../../../../../lib/dash/server/routes'

export const dynamic = 'force-dynamic'

export async function PUT(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  return withDeps(getDashDeps(), deps => handleUpdateDashboard(req, deps, key))
}

export async function DELETE(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  return withDeps(getDashDeps(), deps => handleDeleteDashboard(req, deps, key))
}
