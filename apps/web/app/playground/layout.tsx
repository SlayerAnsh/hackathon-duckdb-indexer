import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'SQL playground · Arkiv SQL', description: 'Run full SQL over live Arkiv data in your browser' }
export default function PlaygroundLayout({ children }: { children: React.ReactNode }) { return children }
