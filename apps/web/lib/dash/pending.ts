'use client'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useTimedQuery } from '../use-query'
import { syncedSql } from './sql'

export type PendingWrite = { key: string; kind: 'widget' | 'dashboard' | 'link'; op: 'upsert' | 'delete'; afterBlock: number; at: number; txHash?: string; fields?: Record<string, string | number> }
const TTL = 5 * 60 * 1000
const empty: PendingWrite[] = []
let writes: PendingWrite[] = empty
const listeners = new Set<() => void>()
function emit() { for (const listener of listeners) listener() }
function subscribe(listener: () => void) {
  listeners.add(listener)
  const timer = setInterval(() => { listPending() }, 1000)
  return () => { listeners.delete(listener); clearInterval(timer) }
}

export function addPending(w: Omit<PendingWrite, 'at'>, now = Date.now()): void {
  writes = [...writes.filter(entry => entry.key !== w.key && now - entry.at <= TTL), { ...w, at: now }]
  emit()
}
export function listPending(now = Date.now()): PendingWrite[] {
  const live = writes.filter(entry => now - entry.at <= TTL)
  if (live.length !== writes.length) { writes = live; emit() }
  return writes
}
export function clearPending(key: string): void {
  const remaining = writes.filter(entry => entry.key !== key)
  if (remaining.length !== writes.length) { writes = remaining; emit() }
}
export function usePending(): PendingWrite[] {
  return useSyncExternalStore(subscribe, () => writes, () => empty)
}

export function useSynced(write: PendingWrite | undefined, version: number): boolean {
  const sql = write ? syncedSql(write.key, write.afterBlock, write.op) : 'SELECT 1 AS n'
  const query = useTimedQuery(sql, version)
  // useTimedQuery retains the previous result until its effect starts the new SQL.
  const previous = useRef({ sql, stale: query.data })
  if (previous.current.sql !== sql) previous.current = { sql, stale: query.data }
  const synced = !write || (query.data !== previous.current.stale && !query.loading && !query.error && Number(query.data?.rows[0]?.[0]) === 1)
  useEffect(() => {
    if (write && synced && writes.includes(write)) clearPending(write.key)
  }, [write, synced])
  return synced
}
