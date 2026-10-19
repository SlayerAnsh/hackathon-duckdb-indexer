'use client'
import { useEffect, useState } from 'react'
const timers = { set: (run: () => void, ms: number): unknown => setTimeout(run, ms), clear: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) }
export function scheduleDebounced(run: () => void, scheduler = timers): () => void {
 const id = scheduler.set(run, 250)
 return () => scheduler.clear(id)
}
export function useDebounced<T>(value: T): T {
 const [debounced, setDebounced] = useState(value)
 useEffect(() => scheduleDebounced(() => setDebounced(value)), [value])
 return debounced
}
