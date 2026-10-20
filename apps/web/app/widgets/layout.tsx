import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Widgets · Arkiv SQL', description: 'One SQL query plus a chart, saved as an Arkiv entity in your wallet' }
export default function WidgetsLayout({ children }: { children: React.ReactNode }) { return children }
