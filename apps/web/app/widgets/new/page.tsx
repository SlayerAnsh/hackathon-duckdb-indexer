'use client'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useDashAuth } from '../../../components/auth/DashAuthProvider'
import { LoginGate } from '../../../components/widgets/LoginGate'
import { WidgetEditor } from '../../../components/widgets/WidgetEditor'
import { initEditor } from '../../../lib/dash/editor-state'
import { isEntityKey } from '../../../lib/dash/schema'

function CreateEditor() {
 const params = useSearchParams()
 const router = useRouter()
 const dashboard = params.get('dashboard')
 return <WidgetEditor mode="create" initial={initEditor(null, dashboard && isEntityKey(dashboard) ? dashboard : null)} onSaved={result => { if (result.key) router.push(`/widgets/${result.key}`) }}/>
}
export function NewWidgetBody() {
 const auth = useDashAuth()
 if (auth.status === 'disabled') return <p>Dashboards are not enabled on this deployment.</p>
 if (auth.status === 'loading') return null
 if (auth.status !== 'authenticated') return <LoginGate title="Log in to save widgets"/>
 return <Suspense fallback={null}><CreateEditor/></Suspense>
}
export default function NewWidgetPage() {
 return <main id="main" className="wrap"><NewWidgetBody/></main>
}
