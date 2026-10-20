'use client'
import { use } from 'react'
import { OrganizeBoard } from '../../../../components/widgets/OrganizeBoard'

export default function OrganizePage({ params }: { params: Promise<{ key: string }> }) {
 const { key } = use(params)
 return <main id="main" className="wrap"><OrganizeBoard dashboardKey={key}/></main>
}
