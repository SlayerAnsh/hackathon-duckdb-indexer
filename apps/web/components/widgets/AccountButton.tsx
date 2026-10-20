'use client'
import { useCallback, useId, useRef, useState } from 'react'
import { shortHex } from '../../lib/format'
import { useRouter } from 'next/navigation'
import { useDashAuth } from '../auth/DashAuthProvider'
import { AccountPopover, PROVIDER_GLYPHS, PROVIDER_LABELS } from './AvatarMenu'
import a from './account.module.css'

export function AccountButton() {
 const auth = useDashAuth()
 const [open, setOpen] = useState(false)
 const trigger = useRef<HTMLButtonElement>(null)
 const id = useId()
 const close = useCallback(() => { setOpen(false); trigger.current?.focus() }, [])
 if (auth.status === 'disabled' || auth.status === 'loading') return null
 const signedIn = auth.status === 'authenticated' && auth.address && auth.login
 return <div className={a.control}>
  {signedIn ? <>
   <button ref={trigger} type="button" className={a.trigger} aria-label={`Account, signed in with ${PROVIDER_LABELS[auth.login!]}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)} onKeyDown={event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) }
   }}><span className={a.dot} aria-hidden="true">{PROVIDER_GLYPHS[auth.login!]}</span><span className="mono">{shortHex(auth.address!)}</span><svg className={a.chev} width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg></button>
   {open && <AccountPopover id={id} address={auth.address!} login={auth.login!} onClose={close} onLogout={auth.logout}/>}
  </> : <LoginButton/>}
  {auth.error && <p className={`notice notice-bad ${a.error}`} role="alert">{auth.error}</p>}
 </div>
}
export const LoginIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 2.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3M2.5 8h7M6.5 5l3 3-3 3"/></svg>
function LoginButton() {
 const auth = useDashAuth()
 const router = useRouter()
 return <button type="button" className={`btn btn-outline ${a.login}`} disabled={auth.confirming} aria-busy={auth.confirming || undefined} onClick={async () => {
  if (await auth.requestLogin()) router.push('/me')
 }}>{auth.confirming ? <><span className="spinner" aria-hidden="true"/>Confirming…</> : <><LoginIcon/>Log in</>}</button>
}
