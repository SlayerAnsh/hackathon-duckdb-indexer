import { OFFICIAL_DASHBOARDS } from '../official-defs'
import type { OpsDeps } from './operations'
import { keepOfficialAlive, officialDashboardExists, readOfficialEnv, seedOfficial, validateOfficialDefinitions } from './official'

export async function runSeedCli(argv: string[], env: Record<string, string | undefined>, io: {
  makeOps(cfg: { privateKey: `0x${string}`; rpcUrl: string }): OpsDeps; log(line: string): void
}): Promise<number> {
  if (argv.length > 1 || argv.some(arg => arg !== '--dry-run' && arg !== '--keepalive')) {
    io.log('Usage: seed-official.ts [--dry-run | --keepalive]')
    return 2
  }
  const cfg = readOfficialEnv(env)
  if (!cfg.ok) { io.log(cfg.reason); return 1 }
  try {
    const defs = validateOfficialDefinitions(OFFICIAL_DASHBOARDS)
    const deps = io.makeOps(cfg)
    if (argv[0] === '--dry-run') {
      for (const def of defs) {
        const exists = await deps.queue.run(() => officialDashboardExists(deps, def.slug))
        io.log(`${def.slug}: ${exists ? 'exists' : 'would create'}`)
      }
    } else if (argv[0] === '--keepalive') {
      const result = await keepOfficialAlive(deps)
      io.log(`Official keepalive extended ${result.extended} entities`)
    } else {
      const result = await seedOfficial(deps, defs)
      for (const item of result.created) io.log(`${item.slug}: created ${item.key}`)
      for (const slug of result.skipped) io.log(`${slug}: exists`)
    }
    return 0
  } catch (error) {
    io.log('Official dashboard operation failed. Check DASHBOARD_PRIVATE_KEY and NEXT_PUBLIC_TIRAMISU_RPC_URL.')
    if (error instanceof Error) io.log(error.message.replace(/0x[0-9a-fA-F]{64}/g, '[redacted]'))
    return 1
  }
}
