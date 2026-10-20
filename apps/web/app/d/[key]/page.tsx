'use client'
import { use } from 'react'
import { DashboardView } from '../../../components/widgets/DashboardView'

export default function DashboardPage({ params }: { params: Promise<{ key: string }> }) {
 const { key } = use(params)
 return <main id="main" className="wrap"><DashboardView dashboardKey={key}/></main>
}
