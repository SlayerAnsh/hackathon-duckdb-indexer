'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { fetchDashWallet, readPublicDashConfig, type PublicDashConfig } from '../../lib/dash/config'
import { dashApi } from '../../lib/dash/api'
import type { UserWalletClient } from '../../lib/dash/wallet'
import { WalletActionError } from '../../lib/dash/widget-actions'
import type { Login, SessionInfo } from '../../lib/dash/schema'

const PrivyBridge = dynamic(() => import('./PrivyBridge'), { ssr: false })
export type DashAuth = {
 config: PublicDashConfig | null
 status: 'loading' | 'anonymous' | 'authenticated' | 'disabled'
 address?: string; login?: Login; confirming: boolean; error: string | null
 sign<T>(job: (client: UserWalletClient) => Promise<T>): Promise<T>
 requestLogin(): Promise<boolean>; logout(): Promise<void>; refresh(): Promise<void>
}
export const DashAuthContext = createContext<DashAuth>({ config: null, status: 'loading', confirming: false, error: null,
 sign: async () => { throw new WalletActionError('wallet') }, requestLogin: async () => false, logout: async () => {}, refresh: async () => {} })
export const useDashAuth = () => useContext(DashAuthContext)
export function oauthReturnPending(search: string): boolean {
 const params = new URLSearchParams(search)
 return params.has('privy_oauth_code') && params.has('privy_oauth_state')
}
export function DashAuthProvider({ children }: { children: ReactNode }) {
 const [config, setConfig] = useState<PublicDashConfig | null>(null)
 const [session, setSession] = useState<SessionInfo | null>(null)
 const [status, setStatus] = useState<DashAuth['status']>('loading')
 const [mode, setMode] = useState<'login' | 'logout' | 'sign' | null>(null)
 const [resume, setResume] = useState(false)
 const [error, setError] = useState<string | null>(null)
 const pending = useRef<{ promise: Promise<boolean>; resolve(value: boolean): void } | null>(null)
 const signing = useRef<{ job: (client: UserWalletClient) => Promise<unknown>; resolve(value: unknown): void; reject(error: unknown): void } | null>(null)
 function cancelSigning() {
  const current = signing.current; signing.current = null
  current?.reject(new WalletActionError('rejected'))
 }
 function sign<T>(job: (client: UserWalletClient) => Promise<T>): Promise<T> {
  if (status !== 'authenticated' || !config?.enabled || signing.current) return Promise.reject(new WalletActionError('wallet'))
  return new Promise<T>((resolve, reject) => {
   signing.current = { job, resolve: value => resolve(value as T), reject }
   setMode('sign')
  })
 }
 function signed(value: unknown) {
  const current = signing.current; signing.current = null; setMode(null); current?.resolve(value)
 }
 function signFailed(error: unknown) {
  const current = signing.current; signing.current = null; setMode(null); current?.reject(error)
 }
 const revision = useRef(0)
 function apply(value: SessionInfo | null) { setSession(value); setStatus(value ? 'authenticated' : 'anonymous') }
 async function refresh() {
  if (!config?.enabled) return
  const current = ++revision.current
  try { const value = await dashApi.session(); if (current === revision.current) apply(value) }
  catch { if (current === revision.current) apply(null) }
 }
 useEffect(() => {
  let active = true
  void fetchDashWallet().then(wallet => {
   if (!active) return
   setConfig(readPublicDashConfig({ privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    wallet, rpcUrl: process.env.NEXT_PUBLIC_TIRAMISU_RPC_URL }))
  })
  return () => { active = false; cancelSigning(); revision.current++; pending.current?.resolve(false); pending.current = null }
 }, [])
 useEffect(() => {
  if (!config) return
  if (!config.enabled) { setStatus('disabled'); return }
  if (oauthReturnPending(window.location.search)) {
   revision.current++; setResume(true); setMode('login'); return
  }
  void refresh()
  return () => { revision.current++ }
 }, [config])
 function requestLogin(): Promise<boolean> {
  cancelSigning()
  if (!config?.enabled) return Promise.resolve(false)
  if (pending.current) return pending.current.promise
  revision.current++
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>(done => { resolve = done })
  pending.current = { promise, resolve }
  setError(null); setMode('login')
  return promise
 }
 async function logout() {
  if (signing.current) { cancelSigning(); setMode(null) }
  await dashApi.logout()
  revision.current++; apply(null); setError(null); setMode('logout')
 }
 function clearOAuthReturn() {
  if (!resume) return
  const url = new URL(window.location.href)
  for (const name of ['privy_oauth_code', 'privy_oauth_state', 'privy_oauth_provider']) url.searchParams.delete(name)
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  setResume(false)
 }
 function done(value: SessionInfo | null) {
  revision.current++; clearOAuthReturn(); apply(value); setMode(null); pending.current?.resolve(!!value); pending.current = null
 }
 function failed(reason: 'cancelled' | 'no_wallet' | 'failed') {
  clearOAuthReturn(); if (resume) apply(null)
  setMode(null); setError(reason === 'cancelled' ? null : "Login didn't finish. Try again.")
  pending.current?.resolve(false); pending.current = null
 }
 return <DashAuthContext.Provider value={{ config, status, ...session, confirming: mode === 'login', error, sign, requestLogin, logout, refresh }}>
  {children}{mode && config?.enabled && <PrivyBridge key={mode} appId={config.privyAppId} mode={mode} rpcUrl={config.rpcUrl} sessionAddress={session?.address} job={signing.current?.job} onSigned={signed} onSignError={signFailed} resume={resume} onDone={done} onError={failed}/>}
 </DashAuthContext.Provider>
}
