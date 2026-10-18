'use client'

import { useEffect, useState } from 'react'
import { IndexDb, type IndexState } from './indexdb'

let db: IndexDb | null = null
let pending: Promise<IndexDb> | null = null
let state: IndexState = { status: 'loading' }
const listeners = new Set<() => void>()
let version = 0
const notify = () => { version++; for (const listener of listeners) listener() }

export function useIndex(): { db: IndexDb | null; state: IndexState; version: number } {
  const [value, setValue] = useState<{ db: IndexDb | null; state: IndexState; version: number }>({ db: null, state: { status: 'loading' }, version: 0 })
  useEffect(() => {
    const update = () => setValue({ db, state, version })
    listeners.add(update)
    update()
    if (!pending) {
      pending = IndexDb.create(window.location.origin, process.env.NEXT_PUBLIC_TIRAMISU_RPC_URL ?? 'https://rpc.tiramisu.db-chain.testnet.arkiv.network')
      void pending.then(instance => {
        db = instance
        if (listeners.size) instance.start(next => { state = next; notify() })
        notify()
      }).catch(error => {
        state = { status: 'error', error: error instanceof Error ? error.message : String(error) }
        pending = null
        notify()
      })
    } else if (db && listeners.size === 1) {
      db.start(next => { state = next; notify() })
    }
    return () => {
      listeners.delete(update)
      if (!listeners.size) db?.stop()
    }
  }, [])
  return value
}
