import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Showcase · Arkiv SQL', description: 'Real SQL over live Arkiv data, measured in your browser.' }
export default function ShowcaseLayout({ children }: { children: React.ReactNode }) { return children }
