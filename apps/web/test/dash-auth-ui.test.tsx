import React from 'react'
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { oauthReturnPending, DashAuthContext, DashAuthProvider, useDashAuth, type DashAuth } from '../components/auth/DashAuthProvider'
import { AccountButton } from '../components/widgets/AccountButton'
import { AvatarMenu, menuIndex } from '../components/widgets/AvatarMenu'
import { LoginGate } from '../components/widgets/LoginGate'
import { bridgeErrorReason, waitForWallet } from '../components/auth/PrivyBridge'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { shortHex } from '../lib/format'

const address = '0x1234567890123456789012345678901234567890'
const auth: DashAuth = { config: { enabled: true, privyAppId: 'app', wallet: '0x' + 'ab'.repeat(20), rpcUrl: 'https://offline.test' }, status: 'anonymous', confirming: false, error: null, requestLogin: async () => true, logout: async () => {}, refresh: async () => {} }
function account(value: Partial<DashAuth>) {
 const router = { bfcacheId: 'test', push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch: async () => {}, hmrRefresh() {} }
 return render(<AppRouterContext.Provider value={router}><DashAuthContext.Provider value={{ ...auth, ...value }}><AccountButton/></DashAuthContext.Provider></AppRouterContext.Provider>)
}
test('account button states and responsive labels', () => {
 expect(account({})).toContain('Build your dashboard')
 expect(account({})).toContain('>Build<')
 for (const status of ['disabled', 'loading'] as const) expect(account({ status })).toBe('')
 expect(account({ status: 'authenticated', address, login: 'google' })).toContain('aria-haspopup="menu"')
 expect(account({ confirming: true })).toContain('Confirming…')
})
test('open avatar menu and login gate use specified copy', () => {
 const menu = render(<AvatarMenu address={address} login="google" open onClose={() => {}} onLogout={async () => {}}/>)
 for (const text of [shortHex(address), 'via Google', 'My home', 'href="/me"', 'Log out']) expect(menu).toContain(text)
 const gate = render(<LoginGate/>)
 for (const text of ['Log in to build dashboards', 'Use Google, Discord, X or Telegram. You never pay gas or hold tokens, and nothing personal goes on chain.', '>Log in<']) expect(gate).toContain(text)
})
test('menu keyboard navigation wraps', () => {
 expect(menuIndex('ArrowDown', 1, 2)).toBe(0)
 expect(menuIndex('ArrowUp', 0, 2)).toBe(1)
 expect(menuIndex('Home', 1, 2)).toBe(0)
 expect(menuIndex('End', 0, 2)).toBe(1)
})
test('wallet polling waits for creation and times out offline', async () => {
 let polls = 0
 expect(await waitForWallet(() => ++polls === 3 ? address : undefined, { sleep: async () => {} })).toBe(address)
 expect(polls).toBe(3)
 await expect(waitForWallet(() => undefined, { timeoutMs: 10, intervalMs: 5, sleep: async () => {} })).rejects.toThrow()
})
test('only the lazy bridge imports Privy', () => {
 for (const file of ['components/auth/DashAuthProvider.tsx', 'components/dash/TopBar.tsx', 'app/layout.tsx']) {
  expect(readFileSync(new URL('../' + file, import.meta.url), 'utf8')).not.toContain('@privy-io/react-auth')
 }
 expect(readFileSync(new URL('../components/auth/PrivyBridge.tsx', import.meta.url), 'utf8')).toContain('@privy-io/react-auth')
})

test('provider exposes a null config and loading status before wallet discovery', () => {
 function State() {
  const value = useDashAuth()
  return <span>{value.status}:{value.config === null ? 'pending' : 'ready'}</span>
 }
 expect(render(<DashAuthProvider><State/></DashAuthProvider>)).toBe('<span>loading:pending</span>')
})

test('OAuth returns require both code and state', () => {
 expect(oauthReturnPending('?privy_oauth_code=a&privy_oauth_state=b&privy_oauth_provider=google')).toBe(true)
 for (const search of ['', '?privy_oauth_code=a', '?x=1']) expect(oauthReturnPending(search)).toBe(false)
})
test('closing the Privy flow is a silent cancellation', () => {
 for (const error of ['exited_auth_flow', { privyErrorCode: 'exited_auth_flow' }, { code: 'exited_auth_flow' }, { message: 'exited_auth_flow' }]) expect(bridgeErrorReason(error)).toBe('cancelled')
 expect(bridgeErrorReason(new Error('boom'))).toBe('failed')
 expect(bridgeErrorReason(null)).toBe('failed')
})
