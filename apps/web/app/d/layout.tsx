import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Dashboard · Arkiv SQL', description: 'Public SQL dashboards over live Arkiv data' }
export default function DashboardLayout({ children }: { children: React.ReactNode }) { return children }
