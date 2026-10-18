'use client'
import { useState } from 'react'
import { useIndex } from '../lib/use-index'
import { DEFAULT_SQL } from '../lib/views'
import { TopBar } from '../components/dash/TopBar'
import { Hero } from '../components/dash/Hero'
import { ShowcaseGallery } from '../components/dash/ShowcaseGallery'
import { QueryConsole } from '../components/dash/QueryConsole'
import { ActivityFeed } from '../components/dash/ActivityFeed'
import { Footer } from '../components/dash/Footer'
export default function Page() {
 const {db,state,version}=useIndex();const [selected,setSelected]=useState('overview');const [sql,setSql]=useState(DEFAULT_SQL)
 const rpcUrl=process.env.NEXT_PUBLIC_TIRAMISU_RPC_URL??'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
 function openSql(next:string){setSql(next);document.getElementById('console')?.scrollIntoView({behavior:'smooth'})}
 return <><TopBar state={state}/><main className="wrap"><Hero version={version} onView={setSelected} manifest={state.manifest}/><ShowcaseGallery selected={selected} onSelect={setSelected} version={version} onSql={openSql}/><QueryConsole db={db} value={sql} onChange={setSql} rpcUrl={rpcUrl} head={state.liveHead}/><ActivityFeed version={version} head={state.liveHead}/></main><Footer/></>
}
