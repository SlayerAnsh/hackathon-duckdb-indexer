'use client'
import { useSynced, type PendingWrite } from '../../lib/dash/pending'

/** Inline "Syncing" chip plus a short note, shown until the index has the write. */
export function SyncChip({ write, version }: { write?: PendingWrite; version: number }) {
 const synced = useSynced(write, version)
 if (!write || synced) return null
 return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap', maxWidth: '100%', fontSize: 'var(--fs-sm)', color: 'var(--text-3b)' }}>
  <span className="chip chip-info" style={{ flex: 'none' }}><span className="spinner" aria-hidden="true" style={{ width: 10, height: 10, borderWidth: 1.5 }}/>Syncing</span>
  <span role="status" aria-live="polite">Saved to Arkiv. The index catches up in a few seconds.</span>
 </span>
}
