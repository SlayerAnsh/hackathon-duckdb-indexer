'use client'
import { useRouter } from 'next/navigation'

/** Client side navigation for internal routes. Falls back to a full load when no app router is mounted (static tests). */
export function useNavigate(): (href: string) => void {
 let router: ReturnType<typeof useRouter> | null = null
 // useRouter only reads context; it throws when the app router is absent, which happens in static render tests.
 try { router = useRouter() } catch { router = null }
 return href => { if (router) router.push(href); else window.location.assign(href) }
}
