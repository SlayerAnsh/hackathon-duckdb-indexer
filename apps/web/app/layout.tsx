import type { Metadata, Viewport } from 'next'
import { DashAuthProvider } from '../components/auth/DashAuthProvider'
import { TopBar } from '../components/dash/TopBar'
import { Footer } from '../components/dash/Footer'
import { THEME_INIT_SCRIPT } from '../lib/theme'
import './theme.css'
import './globals.css'
export const metadata: Metadata = { title: 'Arkiv SQL', description: 'Open source, self hostable Arkiv indexer with a browser SQL playground, widgets and public dashboards over live Arkiv data' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fbfbfa' }, { media: '(prefers-color-scheme: dark)', color: '#121212' }] }
// The shell (skip link, top bar, status bar, footer) lives here so it persists across client navigations.
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}/></head><body><DashAuthProvider><TopBar/>{children}<Footer/></DashAuthProvider></body></html> }
