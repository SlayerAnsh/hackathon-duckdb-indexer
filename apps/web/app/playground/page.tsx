'use client'
import { DEFAULT_RPC_URL } from '../../lib/chain'
import { useIndex } from '../../lib/use-index'
import { Playground } from '../../components/playground/Playground'
export default function PlaygroundPage() {
 const { db, state } = useIndex()
 const rpcUrl = process.env.NEXT_PUBLIC_ARKIV_RPC_URL ?? DEFAULT_RPC_URL
 return <Playground db={db} rpcUrl={rpcUrl} head={state.liveHead}/>
}
