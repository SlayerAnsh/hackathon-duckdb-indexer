import type { Metadata, Viewport } from 'next'
import './theme.css'
import './globals.css'
export const metadata: Metadata = { title: 'Arkiv SQL', description: 'A read only SQL index over live Arkiv data, queried with DuckDB in your browser' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f1115' }
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html> }
