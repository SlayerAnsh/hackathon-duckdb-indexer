import { getDashDeps } from './deps'
import { keepOfficialAlive } from './official'

export type KeepaliveTimer = { stop(): void }
declare global { var __officialKeepalive: KeepaliveTimer | undefined }

export function startOfficialKeepalive(opts: { run(): Promise<unknown>; firstDelayMs?: number; intervalMs?: number;
  setTimer?: (fn: () => void, ms: number) => { unref?(): void }; clearTimer?: (handle: unknown) => void; log?: (message: string) => void }): KeepaliveTimer {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let stopped = false
  let handle: unknown
  const schedule = (ms: number) => {
    if (stopped) return
    const timer = setTimer(() => { void tick() }, ms)
    handle = timer
    timer.unref?.()
  }
  const tick = async () => {
    if (stopped) return
    try { await opts.run() }
    catch (error) { (opts.log ?? console.error)(`Official keepalive failed: ${error instanceof Error ? error.message : 'Unknown error'}`) }
    finally { schedule(opts.intervalMs ?? 21_600_000) }
  }
  schedule(opts.firstDelayMs ?? 60_000)
  return { stop() { stopped = true; clearTimer(handle) } }
}

export function startKeepaliveFromEnv(): void {
  if (globalThis.__officialKeepalive || process.env.NEXT_PHASE === 'phase-production-build') return
  const deps = getDashDeps()
  if ('disabled' in deps) return
  globalThis.__officialKeepalive = startOfficialKeepalive({ run: async () => {
    const result = await keepOfficialAlive(deps.ops)
    if (result.extended) console.log(`Official keepalive extended ${result.extended} entities`)
  }, log: message => console.error(message.replace(/0x[0-9a-fA-F]{64}/g, '[redacted]')) })
}
