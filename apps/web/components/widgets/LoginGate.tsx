'use client'
import { useDashAuth } from '../auth/DashAuthProvider'
import h from './home.module.css'

/** `title` names what logging in unlocks on this page; the default suits Home and Organize. */
export function LoginGate({ title = 'Log in to build dashboards' }: { title?: string }) {
 const auth = useDashAuth()
 return <section className={h.gate} aria-labelledby="login-gate-title">
  <span className={h.gateMark} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg></span>
  <div className={h.gateText}>
   <h1 id="login-gate-title">{title}</h1>
   <p>Use Google, Discord, X or Telegram. Saving widgets and dashboards is free and nothing personal goes on chain. Your widgets belong to your wallet; extending, transferring or deleting them is signed by it and needs a little GLM.</p>
  </div>
  <div className={h.gateActions}>
   <button type="button" className="btn btn-primary btn-lg btn-block" disabled={auth.confirming} aria-busy={auth.confirming || undefined} onClick={() => void auth.requestLogin()}>{auth.confirming ? <><span className="spinner" aria-hidden="true"/>Confirming…</> : 'Log in'}</button>
   {auth.error && <div className="notice notice-bad" role="alert"><div><p>{auth.error}</p></div></div>}
  </div>
 </section>
}
