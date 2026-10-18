import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'Arkiv SQL Explorer', description: 'Explore indexed Arkiv entities with SQL' }
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html> }
