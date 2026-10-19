import { getDashDeps } from '../../../../../lib/dash/server/deps'
import { withDeps } from '../../../../../lib/dash/server/routes'
import { handleGetSession, handleCreateSession, handleDeleteSession } from '../../../../../lib/dash/server/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return withDeps(getDashDeps(), deps => handleGetSession(req, deps))
}

export async function POST(req: Request) {
  return withDeps(getDashDeps(), deps => handleCreateSession(req, deps))
}

export async function DELETE(req: Request) {
  return withDeps(getDashDeps(), () => handleDeleteSession(req))
}
