import type { Metadata } from 'next'
import './theme.css'
import './globals.css'
export const metadata: Metadata = { title: 'Arkiv SQL', description: 'Full SQL over live Arkiv data in your browser' }
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html> }
