// WebSocket entity events probe for arkiv/friction.md ("WebSocket entity events").
//
// Usage, from the repo root after `bun install` (read only, no API key, no writes):
//   bun examples/ws_events_probe.ts            # 70 s: watch 30 s, force a reconnect, watch 40 s more
//   bun examples/ws_events_probe.ts 20         # shorter run of 20 s, reconnect at 10 s
//
// It subscribes with @arkiv-network/sdk watchEntityEvents over the Rabdi WebSocket RPC, closes the
// raw socket halfway to force viem's reconnect, then compares every received event with eth_getLogs
// over HTTP for the same block range and prints the logs (and blocks) the subscription never delivered.
//
// @arkiv-network/sdk and viem are workspace dependencies of packages/core, not of the repo root, so
// they are resolved from there instead of adding a package.json or installing anything here.
import { join } from 'node:path'

const from = join(import.meta.dir, '..', 'packages', 'core')
const sdk = await import(Bun.resolveSync('@arkiv-network/sdk', from))
const viem = await import(Bun.resolveSync('viem', from))
const wsRpc = 'wss://rpc.rabdi.db-chain.testnet.arkiv.network'
const rabdi = viem.defineChain({ id: 7794095, name: 'Rabdi', nativeCurrency: { name: 'Golem', symbol: 'GLM', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.rabdi.db-chain.testnet.arkiv.network'], webSocket: [wsRpc] } }, testnet: true })
const viemVersion = (await import(Bun.resolveSync('viem/package.json', from))).version

const ARKIV_ADDRESS = '0x4400000000000000000000000000000000000044'
const total = Math.max(10, Number(process.argv[2] ?? 70))
const closeAt = total <= 20 ? total / 2 : 30

const t0 = Date.now()
const t = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'
const wsUrl: string = wsRpc
console.log(t(), `sdk 0.8.1, viem ${viemVersion}, bun ${Bun.version}, ws ${wsUrl}, run ${total}s, reconnect at ${closeAt}s`)

type Seen = { block: bigint; tx: string; logIndex: number; type: string }
const seen: Seen[] = []
const errors: string[] = []
const marks: string[] = []
let lastMark = 0

const client = sdk.createPublicClient({ chain: rabdi, transport: viem.webSocket(wsUrl) })
const unwatch = client.watchEntityEvents({
  onEvent: (e: { blockNumber: bigint; transactionHash: string; logIndex: number; type: string }) => {
    seen.push({ block: e.blockNumber, tx: e.transactionHash, logIndex: e.logIndex, type: e.type })
    if (Date.now() - lastMark > 900) { marks.push(`${t()}@${e.blockNumber}`); lastMark = Date.now() }
  },
  onError: (e: Error) => {
    const line = `${t()} ${e.name}: ${e.message.split('\n')[0]}`
    errors.push(line)
    console.log('onError', line)
  },
})
console.log(t(), 'transport type', client.transport.type)

await Bun.sleep(closeAt * 1000)
const before = seen.length
console.log(t(), 'events so far', before, '; closing the raw socket to force a reconnect')
const rpc = await client.transport.getRpcClient()
rpc.socket.close()
await Bun.sleep((total - closeAt) * 1000)
unwatch()

console.log(t(), 'events after reconnect', seen.length - before)
const byType: Record<string, number> = {}
for (const e of seen) byType[e.type] = (byType[e.type] ?? 0) + 1
console.log('by type', byType)
console.log('arrival marks (time@block)', marks.join(' ') || 'none')
console.log('errors', errors.length ? errors : 'none')

if (seen.length) {
  const lo = seen.reduce((m, e) => (e.block < m ? e.block : m), seen[0].block)
  const hi = seen.reduce((m, e) => (e.block > m ? e.block : m), seen[0].block)
  const http = viem.createPublicClient({ chain: rabdi, transport: viem.http() })
  const logs: { transactionHash: string; logIndex: number; blockNumber: bigint }[] =
    await http.getLogs({ address: ARKIV_ADDRESS, fromBlock: lo, toBlock: hi })
  const got = new Set(seen.map(e => `${e.tx}:${e.logIndex}`))
  const missing = logs.filter(l => !got.has(`${l.transactionHash}:${l.logIndex}`))
  console.log(`blocks ${lo}..${hi}: ws events ${seen.length}, eth_getLogs ${logs.length}, missing from ws ${missing.length}, duplicates ${seen.length - got.size}`)
  const missingBlocks = [...new Set(missing.map(l => String(l.blockNumber)))]
  if (missingBlocks.length) console.log('missing blocks', missingBlocks.join(','))
}
process.exit(0)
