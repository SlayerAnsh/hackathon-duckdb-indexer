'use client'
import { useEffect, useRef } from 'react'
import { PrivyProvider, usePrivy, useLogin, useModalStatus, useSignMessage, useWallets } from '@privy-io/react-auth'
import { createUserWalletClient, arkivChain, ARKIV_CHAIN_ID, type UserWalletClient } from '../../lib/dash/wallet'
import { WalletActionError } from '../../lib/dash/widget-actions'
import { dashApi } from '../../lib/dash/api'
import { runSessionHandshake } from '../../lib/dash/auth-client'
import type { SessionInfo } from '../../lib/dash/schema'

export async function waitForWallet(read: () => string | undefined, opts: { timeoutMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<string> {
 const timeout = opts.timeoutMs ?? 20000
 const interval = Math.max(1, opts.intervalMs ?? 250)
 const sleep = opts.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
 for (let elapsed = 0; ; ) {
  const address = read()
  if (address) return address
  if (elapsed >= timeout) throw new Error('Embedded wallet is unavailable.')
  const delay = Math.min(interval, timeout - elapsed)
  await sleep(delay); elapsed += delay
 }
}
export function bridgeErrorReason(error: unknown): 'cancelled' | 'failed' {
 if (error === 'exited_auth_flow') return 'cancelled'
 if (error && typeof error === 'object' && ['privyErrorCode', 'code', 'message'].some(key => (error as Record<string, unknown>)[key] === 'exited_auth_flow')) return 'cancelled'
 return 'failed'
}
type Props = { appId: string; mode: 'login' | 'logout' | 'sign'; rpcUrl: string; sessionAddress?: string; job?: (client: UserWalletClient) => Promise<unknown>; onSigned?(value: unknown): void; onSignError?(error: unknown): void; resume?: boolean; onDone(session: SessionInfo | null): void; onError(reason: 'cancelled' | 'no_wallet' | 'failed'): void }
function Runner(props: Props) {
 const privy = usePrivy()
 const { signMessage } = useSignMessage()
 const { isOpen } = useModalStatus()
 const latest = useRef({ privy, signMessage, props })
 latest.current = { privy, signMessage, props }
 const started = useRef(false), working = useRef(false), finished = useRef(false), opened = useRef(false)
 const mounted = useRef(false)
 useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
 function fail(reason: 'cancelled' | 'no_wallet' | 'failed') {
  if (finished.current || !mounted.current) return
  finished.current = true; latest.current.props.onError(reason)
 }
 const { login } = useLogin({ onError: error => fail(bridgeErrorReason(error)) })
 useEffect(() => {
  if (!props.resume || props.mode !== 'login' || (privy.ready && privy.authenticated)) return
  const timer = setTimeout(() => fail('failed'), 20000)
  return () => clearTimeout(timer)
 }, [props.resume, props.mode, privy.ready, privy.authenticated])
 useEffect(() => {
  if (!privy.ready || finished.current) return
  if (props.mode === 'logout') {
   if (started.current) return
   started.current = true
   void privy.logout().then(() => { if (mounted.current) { finished.current = true; latest.current.props.onDone(null) } }).catch(() => fail('failed'))
   return
  }
  if (!privy.authenticated) {
   if (!props.resume && !started.current) { started.current = true; login() }
   return
  }
  if (working.current) return
  working.current = true
  void (async () => {
   let address: string
   try { address = await waitForWallet(() => latest.current.privy.user?.wallet?.address) }
   catch { fail('no_wallet'); return }
   if (!mounted.current || finished.current) return
   try {
    const session = await runSessionHandshake({ api: dashApi,
     getAccessToken: () => latest.current.privy.getAccessToken(),
     signMessage: async message => (await latest.current.signMessage({ message }, { address })).signature })
    if (mounted.current && !finished.current) { finished.current = true; latest.current.props.onDone(session) }
   } catch { fail('failed') }
  })()
 }, [privy.ready, privy.authenticated, props.mode, props.resume, login, privy.logout])
 useEffect(() => {
  if (isOpen) opened.current = true
  else if (opened.current && !privy.authenticated && props.mode === 'login') fail('cancelled')
 }, [isOpen, privy.authenticated, props.mode])
 return null
}
export function pickEmbeddedWallet<W extends { address: string; walletClientType: string }>(wallets: W[], address: string): W | null {
 return wallets.find(wallet => wallet.walletClientType === 'privy' && wallet.address.toLowerCase() === address.toLowerCase()) ?? null
}
export function needsChainSwitch(chainId: string | undefined): boolean {
 return chainId !== `eip155:${ARKIV_CHAIN_ID}` && chainId !== String(ARKIV_CHAIN_ID)
}
function Signer(props: Props) {
 const privy = usePrivy()
 const wallets = useWallets()
 const { isOpen } = useModalStatus()
 const latest = useRef({ props, privy, wallets })
 latest.current = { props, privy, wallets }
 const mounted = useRef(false), started = useRef(false), working = useRef(false), finished = useRef(false), opened = useRef(false)
 useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
 function fail(error: unknown) {
  if (!mounted.current || finished.current) return
  finished.current = true; latest.current.props.onSignError?.(error)
 }
 const { login } = useLogin({ onError: error => fail(new WalletActionError(bridgeErrorReason(error) === 'cancelled' ? 'rejected' : 'wallet')) })
 useEffect(() => {
  if (!privy.ready || finished.current) return
  if (!privy.authenticated) {
   if (!started.current) { started.current = true; login() }
   return
  }
  if (!wallets.ready || working.current) return
  working.current = true
  void (async () => {
   try {
    const select = () => pickEmbeddedWallet(latest.current.wallets.wallets, latest.current.props.sessionAddress ?? '')
    try { await waitForWallet(() => select()?.address) }
    catch { throw new WalletActionError('mismatch') }
    if (!mounted.current || finished.current) return
    const wallet = select()
    if (!wallet) throw new WalletActionError('mismatch')
    if (needsChainSwitch(wallet.chainId)) await wallet.switchChain(ARKIV_CHAIN_ID)
    if (!mounted.current || finished.current) return
    const provider = await wallet.getEthereumProvider()
    if (!mounted.current || finished.current) return
    const { job, rpcUrl } = latest.current.props
    if (!job) throw new WalletActionError('wallet')
    const client = createUserWalletClient(provider, wallet.address as `0x${string}`, rpcUrl)
    const value = await job(client)
    if (mounted.current && !finished.current) { finished.current = true; latest.current.props.onSigned?.(value) }
   } catch (error) { fail(error) }
  })()
 }, [privy.ready, privy.authenticated, wallets.ready, login])
 useEffect(() => {
  if (isOpen) opened.current = true
  else if (opened.current && !privy.authenticated) fail(new WalletActionError('rejected'))
 }, [isOpen, privy.authenticated])
 return null
}
export default function PrivyBridge(props: Props) {
 const chain = arkivChain(props.rpcUrl)
 return <PrivyProvider appId={props.appId} config={{ supportedChains: [chain], defaultChain: chain, loginMethods: ['google', 'discord', 'twitter', 'telegram'], embeddedWallets: { ethereum: { createOnLogin: 'all-users' }, showWalletUIs: false } }}>{props.mode === 'sign' ? <Signer {...props}/> : <Runner {...props}/>}</PrivyProvider>
}
