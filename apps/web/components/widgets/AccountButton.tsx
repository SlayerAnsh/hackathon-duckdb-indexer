'use client'
import { useCallback, useId, useRef, useState } from 'react'
import { shortHex } from '../../lib/format'
import { useRouter } from 'next/navigation'
import { useDashAuth } from '../auth/DashAuthProvider'
import { AvatarMenu, PROVIDER_LABELS } from './AvatarMenu'

export function AccountButton() {
 const auth = useDashAuth()
 const [open, setOpen] = useState(false)
 const trigger = useRef<HTMLButtonElement>(null)
 const id = useId()
 const close = useCallback(() => { setOpen(false); trigger.current?.focus() }, [])
 if (auth.status === 'disabled' || auth.status === 'loading') return null
 return <div className="account-control">
  {auth.status === 'authenticated' && auth.address && auth.login ? <>
   <button ref={trigger} type="button" className="avatar-button acct" aria-label={`Account via ${PROVIDER_LABELS[auth.login]}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)} onKeyDown={event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
   }}><span className="avatar-dot" aria-hidden="true">{({ google: 'G', discord: '◉', x: '𝕏', telegram: '➤' })[auth.login]}</span><span className="mono">{shortHex(auth.address)}</span><span aria-hidden="true">⌄</span></button>
   <AvatarMenu id={id} address={auth.address} login={auth.login} open={open} onClose={close} onLogout={auth.logout}/>
  </> : <LoginButton/>}
  {auth.error && <p className="error account-error" role="alert">{auth.error}</p>}
 </div>
}
function LoginButton() {
 const auth = useDashAuth()
 const router = useRouter()
 return <button type="button" className="btn btn-outline" disabled={auth.confirming} onClick={async () => {
  if (await auth.requestLogin()) router.push('/me')
 }}>{auth.confirming ? 'Confirming…' : <><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span className="build-long">Build your dashboard</span><span className="build-short">Build</span></>}</button>
}
