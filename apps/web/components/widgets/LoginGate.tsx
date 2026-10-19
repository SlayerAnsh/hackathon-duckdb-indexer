'use client'
import { useDashAuth } from '../auth/DashAuthProvider'

export function LoginGate() {
 const auth = useDashAuth()
 return <section className="login-gate">
  <h1>Log in to build dashboards</h1>
  <p>Use Google, Discord, X or Telegram. You never pay gas or hold tokens, and nothing personal goes on chain.</p>
  <button type="button" className="btn btn-primary" disabled={auth.confirming} onClick={() => void auth.requestLogin()}>{auth.confirming ? 'Confirming…' : 'Log in'}</button>
  {auth.error && <p className="error" role="alert">{auth.error}</p>}
 </section>
}
