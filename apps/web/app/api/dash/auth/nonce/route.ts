import { getDashDeps } from '../../../../../lib/dash/server/deps'
import { withDeps } from '../../../../../lib/dash/server/routes'
import { handleNonce } from '../../../../../lib/dash/server/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return withDeps(getDashDeps(), deps => handleNonce(req, deps))
}
