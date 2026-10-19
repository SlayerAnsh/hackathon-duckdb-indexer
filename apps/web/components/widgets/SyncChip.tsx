'use client'
import { useSynced, type PendingWrite } from '../../lib/dash/pending'

export function SyncChip({ write, version }: { write?: PendingWrite; version: number }) {
 const synced = useSynced(write, version)
 if (!write || synced) return null
 return <><span className="state state-disk">Syncing</span><span role="status" aria-live="polite">Saved to Arkiv. The index catches up in a few seconds.</span></>
}
