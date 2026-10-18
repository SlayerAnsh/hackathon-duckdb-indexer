'use client'
import { useCallback, useEffect, useState } from 'react'
import type { IndexState } from '../../lib/indexdb'

export type LiveMode = 'live' | 'paused'
export const LIVE_MODE_KEY = 'arkiv-showcase-mode'
type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** The stored mode, or live when storage is missing, blocked or holds anything else. */
export function readMode(storage: Store | undefined): LiveMode {
 try { return storage?.getItem(LIVE_MODE_KEY) === 'paused' ? 'paused' : 'live' } catch { return 'live' }
}
export function writeMode(storage: Store | undefined, mode: LiveMode) {
 try { storage?.setItem(LIVE_MODE_KEY, mode) } catch { /* per viewer convenience only */ }
}

/** Newest block the index has reached. */
export const headBlock = (state: IndexState): number | undefined => state.liveHead ?? state.deltaTo ?? state.manifest?.headBlock

export function pausedNote(pausedAt: number | undefined, head: number | undefined): string {
 if (pausedAt === undefined) return 'Paused'
 const base = `Paused at block ${pausedAt.toLocaleString('en-US')}`
 const behind = head === undefined ? 0 : head - pausedAt
 return behind > 0 ? `${base} · ${behind.toLocaleString('en-US')} ${behind === 1 ? 'block' : 'blocks'} since` : base
}

const storage = () => { try { return window.localStorage } catch { return undefined } }

/** Live or paused showcase reruns. `resume` increases each time the viewer switches back to live, so cards rerun once. */
export function useLiveMode(head: number | undefined) {
 const [mode, setModeState] = useState<LiveMode>('live')
 const [pausedAt, setPausedAt] = useState<number | undefined>(undefined)
 const [resume, setResume] = useState(0)
 useEffect(() => { if (readMode(storage()) === 'paused') setModeState('paused') }, [])
 useEffect(() => { if (mode === 'paused' && pausedAt === undefined && head !== undefined) setPausedAt(head) }, [mode, pausedAt, head])
 const setMode = useCallback((next: LiveMode) => {
  if (next === mode) return
  writeMode(storage(), next)
  setModeState(next)
  if (next === 'live') { setPausedAt(undefined); setResume(n => n + 1) }
 }, [mode])
 return { mode, setMode, paused: mode === 'paused', pausedAt, resume, note: mode === 'paused' ? pausedNote(pausedAt, head) : undefined }
}
