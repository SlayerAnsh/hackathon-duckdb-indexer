import { buildOps } from '../lib/dash/server/deps'
import { runSeedCli } from '../lib/dash/server/seed-cli'

process.exit(await runSeedCli(process.argv.slice(2), process.env, {
  makeOps: c => buildOps(c.privateKey, c.rpcUrl), log: line => console.log(line),
}))
