'use client'
import { useEffect, useState } from 'react'
import { useIndex } from './use-index'
export type TimedResult = { data?: { columns: string[]; rows: unknown[][] }; ms?: number; error?: string; loading: boolean }
export function useTimedQuery(sql: string, version: number): TimedResult {
 const {db,state} = useIndex()
 const [result,setResult] = useState<TimedResult>({loading:true})
 useEffect(() => {
  if(!db || !state.manifest) return
  let active = true
  setResult(previous=>({...previous,loading:true,error:undefined}))
  void db.run(sql, Infinity).then(data=>{ if(active) setResult({data,ms:data.elapsedMs,loading:false}) }).catch(error=>{ if(active) setResult(previous=>({...previous,error:error instanceof Error?error.message:String(error),loading:false})) })
  return ()=>{active=false}
 },[db,sql,version,state.manifest?.version])
 return result
}
