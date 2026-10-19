'use client'
import { use } from 'react'
import { DashboardView } from '../../../components/widgets/DashboardView'
import { TopBar } from '../../../components/dash/TopBar'
import { Footer } from '../../../components/dash/Footer'

export default function DashboardPage({ params }: { params: Promise<{ key: string }> }) {
 const { key } = use(params)
 return <><TopBar/><main className="wrap"><DashboardView dashboardKey={key}/></main><Footer/></>
}
