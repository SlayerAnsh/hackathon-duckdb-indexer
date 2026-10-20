'use client'
import { useEffect, useState } from 'react'
import { browserRpcUrl } from '../rpc-browser'
import { balanceLevel, readBalance, type BalanceLevel } from './wallet'

export function useWalletBalance(address: string | undefined, rpcUrl: string | undefined, revision = 0): { wei: bigint | null; level: BalanceLevel; refresh(): void } {
 const [refreshRevision, setRefreshRevision] = useState(0)
 const [result, setResult] = useState<{ address: string; rpcUrl: string; revision: number; refreshRevision: number; wei: bigint | null } | null>(null)
 useEffect(() => {
  let active = true
  setResult(null)
  if (address && rpcUrl) void readBalance(browserRpcUrl(rpcUrl), address).then(wei => {
   if (active) setResult({ address, rpcUrl, revision, refreshRevision, wei })
  })
  return () => { active = false }
 }, [address, rpcUrl, revision, refreshRevision])
 const wei = result && result.address === address && result.rpcUrl === rpcUrl && result.revision === revision && result.refreshRevision === refreshRevision ? result.wei : null
 return { wei, level: balanceLevel(wei), refresh: () => setRefreshRevision(value => value + 1) }
}
