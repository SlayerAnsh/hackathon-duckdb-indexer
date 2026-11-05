import React from 'react'
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { renderToStaticMarkup as render } from 'react-dom/server'
import { oauthReturnPending, DashAuthContext, DashAuthProvider, useDashAuth, type DashAuth } from '../components/auth/DashAuthProvider'
import { AccountButton } from '../components/widgets/AccountButton'
import { AccountPopoverView, menuIndex } from '../components/widgets/AvatarMenu'
import { ThemeToggle } from '../components/dash/ThemeToggle'
import { addressUrl } from '../lib/explorer'
import { LoginGate } from '../components/widgets/LoginGate'
import { bridgeErrorReason, waitForWallet, pickEmbeddedWallet, needsChainSwitch } from '../components/auth/PrivyBridge'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { shortHex } from '../lib/format'

const address = '0x1234567890123456789012345678901234567890'
const auth: DashAuth = { sign: async () => { throw Error('unused') }, config: { enabled: true, privyAppId: 'app', wallet: '0x' + 'ab'.repeat(20), rpcUrl: 'https://offline.test' }, status: 'anonymous', confirming: false, error: null, requestLogin: async () => true, logout: async () => {}, refresh: async () => {} }
function account(value: Partial<DashAuth>) {
 const router = { bfcacheId: 'test', push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch: async () => {}, hmrRefresh() {} }
 return render(<AppRouterContext.Provider value={router}><DashAuthContext.Provider value={{ ...auth, ...value }}><AccountButton/></DashAuthContext.Provider></AppRouterContext.Provider>)
}
test('account button states and responsive labels', () => {
 expect(account({})).toContain('Log in')
 expect(account({})).not.toContain('Build your dashboard')
 expect(account({})).not.toContain('build-long')
 for (const status of ['disabled', 'loading'] as const) expect(account({ status })).toBe('')
 expect(account({ status: 'authenticated', address, login: 'google' })).toContain('aria-haspopup="dialog"')
 expect(account({ confirming: true })).toContain('Confirming…')
})
const popAddress = '0x1111111111111111111111111111111111111111'
function popover(balance: { wei: bigint | null; level: 'unknown' | 'empty' | 'low' | 'ok' }, copied = false) {
 return render(<AccountPopoverView address={popAddress} login="google" balance={balance} copied={copied} onCopy={() => {}} onClose={() => {}} onLogout={() => {}}/>)
}
test('account popover shows identity, balance warnings, links and log out', () => {
 const low = popover({ wei: BigInt("50000000000000000"), level: 'low' })
 for (const text of ['Signed in with Google', '0.05 tGLM', 'Below 0.1 tGLM', 'href="/me"', 'href="/widgets/new"', 'href="/explore"', 'Log out', 'role="dialog"', 'aria-label="Account"', `href="${addressUrl(popAddress)}"`, 'target="_blank"', 'Copy address']) expect(low).toContain(text)
 expect(popover({ wei: BigInt(0), level: 'empty' })).toContain('No tGLM')
 const unknown = popover({ wei: null, level: 'unknown' })
 expect(unknown).toContain('Balance unavailable')
 for (const text of ['Below 0.1 tGLM', 'No tGLM']) expect(unknown).not.toContain(text)
 expect(popover({ wei: BigInt("1000000000000000000"), level: 'ok' }, true)).toContain('Copied')
})
test('icon buttons never use the chart tooltip class', () => {
 const bareTip = /class="([^"]* )?tip( [^"]*)?"/
 for (const html of [popover({ wei: null, level: 'unknown' }), render(<ThemeToggle/>)]) {
  expect(html).not.toMatch(bareTip)
  expect(html).toContain('has-tip')
 }
})
test('login gate uses specified copy', () => {
 expect(shortHex(address)).toContain('…')
 const gate = render(<LoginGate/>)
 for (const text of ['Log in to build dashboards', 'Use Google, Discord, X or Telegram. Saving widgets and dashboards is free and nothing personal goes on chain. Your widgets belong to your wallet; extending, transferring or deleting them is signed by it and needs a little tGLM.', '>Log in<']) expect(gate).toContain(text)
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


test('signer picks only the matching embedded wallet and checks Rabdi', () => {
 const embedded = { address: address.toUpperCase().replace('0X', '0x'), walletClientType: 'privy' }
 const external = { address, walletClientType: 'metamask' }
 expect(pickEmbeddedWallet([embedded, external], address)).toBe(embedded)
 expect(pickEmbeddedWallet([external], address)).toBeNull()
 expect(needsChainSwitch('eip155:7794095')).toBe(false)
 expect(needsChainSwitch('7794095')).toBe(false)
 expect(needsChainSwitch('eip155:1')).toBe(true)
 expect(needsChainSwitch(undefined)).toBe(true)
})
test('wallet client construction stays in the lazy bridge', () => {
 function scan(dir: string) {
  for (const entry of readdirSync(new URL('../' + dir, import.meta.url), { withFileTypes: true })) {
   const file = dir + '/' + entry.name
   if (entry.isDirectory()) scan(file)
   else if (/\.tsx?$/.test(file) && !['components/auth/PrivyBridge.tsx', 'lib/dash/wallet.ts'].includes(file)) expect(readFileSync(new URL('../' + file, import.meta.url), 'utf8')).not.toContain('createUserWalletClient(')
  }
 }
 scan('components'); scan('lib')
})
test('default auth rejects signing with a safe wallet error', async () => {
 let result!: Promise<unknown>
 function Consumer() { result = useDashAuth().sign(async () => 1); return null }
 render(<Consumer/>)
 await expect(result).rejects.toMatchObject({ kind: 'wallet', message: 'wallet' })
})

test('login copy no longer promises free wallet actions', () => {
 expect(render(<LoginGate/>)).not.toContain('You never pay gas or hold tokens')
})
