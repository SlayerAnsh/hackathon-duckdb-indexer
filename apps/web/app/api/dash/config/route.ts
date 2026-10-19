import { readServerDashConfig } from '../../../../lib/dash/server/config'
import { handleDashConfig } from '../../../../lib/dash/server/routes'

export const dynamic = 'force-dynamic'

export function GET() {
  const result = readServerDashConfig(process.env)
  return handleDashConfig({ config: result.ok ? result.config : null })
}
