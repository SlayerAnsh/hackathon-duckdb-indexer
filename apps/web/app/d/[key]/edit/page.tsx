'use client'
import { use } from 'react'
import { OrganizeBoard } from '../../../../components/widgets/OrganizeBoard'
import { TopBar } from '../../../../components/dash/TopBar'
import { Footer } from '../../../../components/dash/Footer'

export default function OrganizePage({ params }: { params: Promise<{ key: string }> }) {
 const { key } = use(params)
 return <><TopBar/><main id="main" className="wrap"><OrganizeBoard dashboardKey={key}/></main><Footer/></>
}
