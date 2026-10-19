import { getDashDeps } from '../../../../../lib/dash/server/deps'
import { withDeps } from '../../../../../lib/dash/server/routes'
import { handleUpdateWidget, handleDeleteWidget } from '../../../../../lib/dash/server/routes'

export const dynamic = 'force-dynamic'

export async function PUT(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  return withDeps(getDashDeps(), deps => handleUpdateWidget(req, deps, key))
}

export async function DELETE(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params
  return withDeps(getDashDeps(), deps => handleDeleteWidget(req, deps, key))
}
