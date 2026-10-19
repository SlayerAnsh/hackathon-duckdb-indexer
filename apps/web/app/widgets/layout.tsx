import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Widgets · Arkiv SQL', description: 'Build and save SQL widgets over live Arkiv data' }
export default function WidgetsLayout({ children }: { children: React.ReactNode }) { return children }
