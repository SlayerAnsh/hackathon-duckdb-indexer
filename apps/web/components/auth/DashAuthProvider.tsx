'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { publicDashConfig } from '../../lib/dash/config'
import { dashApi } from '../../lib/dash/api'
import type { Login, SessionInfo } from '../../lib/dash/schema'

const PrivyBridge = dynamic(() => import('./PrivyBridge'), { ssr: false })
export type DashAuth = {
 status: 'loading' | 'anonymous' | 'authenticated' | 'disabled'
 address?: string; login?: Login; confirming: boolean; error: string | null
 requestLogin(): Promise<boolean>; logout(): Promise<void>; refresh(): Promise<void>
}
export const DashAuthContext = createContext<DashAuth>({ status: 'disabled', confirming: false, error: null,
 requestLogin: async () => false, logout: async () => {}, refresh: async () => {} })
export const useDashAuth = () => useContext(DashAuthContext)
export function DashAuthProvider({ children }: { children: ReactNode }) {
 const [config] = useState(publicDashConfig)
 const [session, setSession] = useState<SessionInfo | null>(null)
 const [status, setStatus] = useState<DashAuth['status']>(config.enabled ? 'loading' : 'disabled')
 const [mode, setMode] = useState<'login' | 'logout' | null>(null)
 const [error, setError] = useState<string | null>(null)
 const pending = useRef<{ promise: Promise<boolean>; resolve(value: boolean): void } | null>(null)
 const revision = useRef(0)
 function apply(value: SessionInfo | null) { setSession(value); setStatus(value ? 'authenticated' : 'anonymous') }
 async function refresh() {
  if (!config.enabled) return
  const current = ++revision.current
  try { const value = await dashApi.session(); if (current === revision.current) apply(value) }
  catch { if (current === revision.current) apply(null) }
 }
 useEffect(() => { void refresh(); return () => { revision.current++; pending.current?.resolve(false); pending.current = null } }, [])
 function requestLogin(): Promise<boolean> {
  if (!config.enabled) return Promise.resolve(false)
  if (pending.current) return pending.current.promise
  revision.current++
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>(done => { resolve = done })
  pending.current = { promise, resolve }
  setError(null); setMode('login')
  return promise
 }
 async function logout() {
  await dashApi.logout()
  revision.current++; apply(null); setError(null); setMode('logout')
 }
 function done(value: SessionInfo | null) {
  apply(value); setMode(null); pending.current?.resolve(!!value); pending.current = null
 }
 function failed(reason: 'cancelled' | 'no_wallet' | 'failed') {
  setMode(null); setError(reason === 'cancelled' ? null : "Login didn't finish. Try again.")
  pending.current?.resolve(false); pending.current = null
 }
 return <DashAuthContext.Provider value={{ status, ...session, confirming: mode === 'login', error, requestLogin, logout, refresh }}>
  {children}{mode && <PrivyBridge key={mode} appId={config.privyAppId} mode={mode} onDone={done} onError={failed}/>}
 </DashAuthContext.Provider>
}
