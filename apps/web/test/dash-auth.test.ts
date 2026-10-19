import { expect, test } from 'bun:test'
import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'
import { readServerDashConfig } from '../lib/dash/server/config'
import { createPrivyVerifier, identityFromUser, type PrivyIdentity } from '../lib/dash/server/privy'
import { assertWriteRequest, publicHost, clientIp, isSecure, readJson, handleNonce, handleCreateSession, handleGetSession, handleDeleteSession, type AuthDeps } from '../lib/dash/server/auth'
import { NonceStore } from '../lib/dash/server/nonce'
import { NONCE_RULES, RateLimiter } from '../lib/dash/server/rate-limit'
import { deriveSessionSecret, SESSION_TTL_SECONDS } from '../lib/dash/server/session'

const account = privateKeyToAccount(('0x' + '42'.repeat(32)) as Hex)
const info = { address: account.address.toLowerCase(), login: 'google' }
function fixture() {
  let time = 1_800_000_000_000
  const now = () => time
  const identity: PrivyIdentity = { userId: 'did:privy:1', wallets: [info.address], login: 'google' }
  const deps: AuthDeps = { config: { sessionSecret: deriveSessionSecret('test') }, now,
    nonces: new NonceStore({ now }), nonceLimiter: new RateLimiter(NONCE_RULES, now),
    privy: { verify: async token => { if (token !== 'good') throw new Error('invalid token'); return identity } } }
  return { deps, identity, advance: (ms: number) => { time += ms } }
}
function request(path: string, method = 'POST', body?: unknown, headers: Record<string, string> = {}) {
  return new Request('https://web.test/api/dash/auth/' + path, { method,
    headers: { 'content-type': 'application/json', origin: 'https://web.test', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
}
async function signed(deps: AuthDeps, signer = account) {
  const response = await handleNonce(request('nonce'), deps)
  const { nonce, message } = await response.json()
  return { nonce, signature: await signer.signMessage({ message }) }
}

test('server config derives the wallet from the key without echoing secrets', () => {
  const key = '0x' + '42'.repeat(32)
  const env = { NEXT_PUBLIC_PRIVY_APP_ID: 'app', PRIVY_APP_SECRET: 's3cret', DASHBOARD_PRIVATE_KEY: key }
  expect(readServerDashConfig(env)).toMatchObject({ ok: true, config: { wallet: info.address, rpcUrl: 'https://rpc.tiramisu.db-chain.testnet.arkiv.network' } })
  for (const missing of Object.keys(env)) expect(readServerDashConfig({ ...env, [missing]: '' }).ok).toBe(false)
  for (const patch of [{ DASHBOARD_PRIVATE_KEY: 'bad' }, { DASHBOARD_PRIVATE_KEY: '0x' + '00'.repeat(32) }]) {
    const result = readServerDashConfig({ ...env, ...patch })
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result).includes('42424242')).toBe(false)
    expect(JSON.stringify(result).includes('s3cret')).toBe(false)
  }
})
test('identity selects embedded Ethereum wallets and the latest supported login', () => {
  const user = { id: 'u', linked_accounts: [
    { type: 'wallet', wallet_client_type: 'privy', connector_type: 'embedded', chain_type: 'ethereum', address: account.address },
    { type: 'wallet', wallet_client_type: 'metamask', connector_type: 'injected', chain_type: 'ethereum', address: '0x' + '99'.repeat(20) },
    { type: 'google_oauth', latest_verified_at: 10 }, { type: 'twitter_oauth', latest_verified_at: 20 }, { type: 'email', latest_verified_at: 30 }] }
  expect(identityFromUser(user as any)).toEqual({ userId: 'u', wallets: [info.address], login: 'x' })
  expect(identityFromUser({ id: 'u', linked_accounts: [{ type: 'email' }] } as any).login).toBeNull()
  for (const [type, login] of [['discord_oauth', 'discord'], ['telegram', 'telegram'], ['google_oauth', 'google']] as const) {
    expect(identityFromUser({ id: 'u', linked_accounts: [{ type, latest_verified_at: null }] } as any).login).toBe(login)
  }
})
test('Privy verifier verifies the token before fetching its user', async () => {
  const calls: string[] = []
  const verifier = createPrivyVerifier({ utils: () => ({ auth: () => ({ verifyAccessToken: async (token: string) => {
    calls.push('verify'); expect(token === 'test-token').toBe(true); return { user_id: 'u' }
  } }) }), users: () => ({ _get: async (id: string) => { calls.push(id); return { id, linked_accounts: [] } } }) } as any)
  expect(await verifier.verify('test-token')).toEqual({ userId: 'u', wallets: [], login: null })
  expect(calls).toEqual(['verify', 'u'])
})
test('nonce endpoint is rate limited per IP', async () => {
  const { deps } = fixture()
  for (let i = 0; i < 20; i++) {
    const res = await handleNonce(request('nonce', 'POST', undefined, { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), deps)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nonce).toMatch(/^[0-9a-f]{64}$/)
    expect(body.message).toContain('Domain: web.test')
  }
  const limited = await handleNonce(request('nonce', 'POST', undefined, { 'x-forwarded-for': '9.9.9.9, 5.6.7.8' }), deps)
  expect(limited.status).toBe(429); expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
  expect((await handleNonce(request('nonce', 'POST', undefined, { 'x-forwarded-for': '2.3.4.5' }), deps)).status).toBe(200)
})
test('session verifies bearer, signer, linked wallet and single use nonce', async () => {
  const { deps, identity } = fixture()
  const body = await signed(deps)
  const res = await handleCreateSession(request('session', 'POST', body, { authorization: 'Bearer good' }), deps)
  expect(res.status).toBe(200); expect(await res.json()).toEqual(info)
  expect(res.headers.get('set-cookie')?.startsWith('dash_session=')).toBe(true)
  expect(res.headers.get('set-cookie')).toContain('; Secure')
  expect((await handleCreateSession(request('session', 'POST', body, { authorization: 'Bearer good' }), deps)).status).toBe(401)
  for (const headers of [{}, { authorization: 'Bearer bad' }] as Record<string, string>[]) {
    expect((await handleCreateSession(request('session', 'POST', await signed(deps), headers), deps)).status).toBe(401)
  }
  const other = privateKeyToAccount(('0x' + '43'.repeat(32)) as Hex)
  expect((await handleCreateSession(request('session', 'POST', await signed(deps, other), { authorization: 'Bearer good' }), deps)).status).toBe(401)
  identity.login = null
  const forbidden = await handleCreateSession(request('session', 'POST', await signed(deps), { authorization: 'Bearer good' }), deps)
  expect(forbidden.status).toBe(403)
  expect((await forbidden.json()).message).toBe('Use Google, Discord, X or Telegram to log in.')
  identity.login = 'google'; identity.wallets = []
  expect((await handleCreateSession(request('session', 'POST', await signed(deps), { authorization: 'Bearer good' }), deps)).status).toBe(401)
})
test('get and delete session reject missing, tampered and expired cookies', async () => {
  const { deps, advance } = fixture()
  const created = await handleCreateSession(request('session', 'POST', await signed(deps), { authorization: 'Bearer good' }), deps)
  const cookie = created.headers.get('set-cookie')!.split(';')[0]
  const get = (value?: string) => handleGetSession(request('session', 'GET', undefined, value ? { cookie: value } : {}), deps)
  expect(await (await get(cookie)).json()).toEqual(info)
  expect((await get()).status).toBe(401)
  expect((await get(cookie + 'x')).status).toBe(401)
  advance(SESSION_TTL_SECONDS * 1000)
  expect((await get(cookie)).status).toBe(401)
  const deleted = await handleDeleteSession(request('session', 'DELETE'))
  expect(deleted.status).toBe(200); expect(await deleted.json()).toEqual({ ok: true })
  expect(deleted.headers.get('set-cookie')).toContain('dash_session=;')
  expect(deleted.headers.get('set-cookie')).toContain('Max-Age=0')
})
test('write requests need JSON and a matching origin host', () => {
  expect(() => assertWriteRequest(request('session', 'POST', {}, { 'content-type': 'text/plain' }))).toThrow()
  expect(() => assertWriteRequest(request('session', 'POST', {}, { origin: 'https://evil.test' }))).toThrow()
  expect(() => assertWriteRequest(request('session', 'POST', {}, { origin: 'null' }))).toThrow()
  expect(() => assertWriteRequest(request('session', 'POST', {}, { 'content-type': 'application/json; charset=utf-8' }))).not.toThrow()
  expect(clientIp(request('nonce'))).toBe('unknown')
  expect(isSecure(request('nonce'))).toBe(true)
  expect(isSecure(new Request('http://web.test'))).toBe(false)
})
test('JSON parsing rejects malformed and oversized streamed bodies', async () => {
  await expect(readJson(new Request('https://web.test', { method: 'POST', body: '{' }))).rejects.toMatchObject({ code: 'invalid' })
  await expect(readJson(new Request('https://web.test', { method: 'POST', body: JSON.stringify('é'.repeat(17000)) }))).rejects.toMatchObject({ code: 'invalid' })
  expect(await readJson(request('session', 'POST', { ok: true }))).toEqual({ ok: true })
  const { deps } = fixture()
  expect((await handleCreateSession(request('session', 'POST', {}, { authorization: 'Bearer good' }), deps)).status).toBe(400)
})

test('public host drives origin checks and nonce domains behind the proxy', async () => {
  const make = (headers: Record<string, string>) => new Request('http://0.0.0.0:3000/api/dash/session', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://app.example.com', ...headers },
  })
  for (const headers of [{ host: 'app.example.com' }, { host: 'web:3000', 'x-forwarded-host': 'APP.EXAMPLE.COM, internal' }] as Record<string, string>[]) {
    const req = make(headers)
    expect(publicHost(req)).toBe('app.example.com')
    expect(() => assertWriteRequest(req)).not.toThrow()
    const res = await handleNonce(req, fixture().deps)
    expect(res.status).toBe(200)
    expect((await res.json()).message).toContain('Domain: app.example.com')
  }
  expect(() => assertWriteRequest(make({ host: 'app.example.com', origin: 'https://evil.example' }))).toThrow(expect.objectContaining({ code: 'forbidden' }))
  expect(publicHost(new Request('https://fallback.example/path'))).toBe('fallback.example')
})
test('client IP uses the final proxy entry and groups IPv6 by prefix', () => {
  for (const [forwarded, expected] of [
    ['1.2.3.4, 203.0.113.9', '203.0.113.9'],
    ['2001:db8:1:2:aaaa::1', '2001:0db8:0001:0002::/64'],
    ['2001:db8::1, ,', '2001:0db8:0000:0000::/64'],
  ]) expect(clientIp(request('nonce', 'POST', undefined, { 'x-forwarded-for': forwarded }))).toBe(expected)
  expect(clientIp(request('nonce', 'POST', undefined, { 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
})
