export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startKeepaliveFromEnv } = await import('./lib/dash/server/keepalive')
  startKeepaliveFromEnv()
}
