'use client'
import { useIndex } from '../../lib/use-index'
import { TopBar } from '../../components/dash/TopBar'
import { Footer } from '../../components/dash/Footer'
import { Playground } from '../../components/playground/Playground'
export default function PlaygroundPage() {
 const { db, state } = useIndex()
 const rpcUrl = process.env.NEXT_PUBLIC_TIRAMISU_RPC_URL ?? 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
 return <><TopBar state={state}/><Playground db={db} rpcUrl={rpcUrl} head={state.liveHead}/><Footer/></>
}
