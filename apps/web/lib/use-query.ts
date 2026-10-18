'use client'
import { useEffect, useRef, useState } from 'react'
import { useIndex } from './use-index'
export type TimedResult = { data?: { columns: string[]; rows: unknown[][] }; ms?: number; error?: string; loading: boolean }
export type QueryControl = { paused?: boolean; nonce?: number }

/** What a query reruns on: the current data key while live, the key of its last run while paused (or the current one before any run). */
export const runKey = (current: string, lastRun: string | undefined, paused: boolean) => (paused && lastRun !== undefined ? lastRun : current)

/** Runs `sql` and reruns it when the data changes. `paused` holds the last result; bumping `nonce` reruns now. */
export function useTimedQuery(sql: string, version: number, control: QueryControl = {}): TimedResult {
 const {db,state} = useIndex()
 const [result,setResult] = useState<TimedResult>({loading:true})
 const lastRun = useRef<string | undefined>(undefined)
 const manifestVersion = state.manifest?.version
 const key = runKey(`${version}|${manifestVersion}`, lastRun.current, !!control.paused)
 const nonce = control.nonce ?? 0
 useEffect(() => {
  if(!db || manifestVersion === undefined) return
  lastRun.current = key
  let active = true
  setResult(previous=>({...previous,loading:true,error:undefined}))
  void db.run(sql, Infinity).then(data=>{ if(active) setResult({data,ms:data.elapsedMs,loading:false}) }).catch(error=>{ if(active) setResult(previous=>({...previous,error:error instanceof Error?error.message:String(error),loading:false})) })
  return ()=>{active=false}
 },[db,sql,key,nonce,manifestVersion === undefined])
 return result
}
