'use client'
import type { IndexState } from '../lib/indexdb'
export function StatusBar({ state }: { state: IndexState }) {
 const m = state.manifest
 return <header><h1>Arkiv SQL Explorer</h1><p>Query the live index with SQL</p>{m && <><p>Chain {m.chainId} · snapshot v{m.version} · as of block {state.deltaTo ?? m.snapshotBlock} · head lag {Math.max(0, (state.liveHead ?? m.headBlock) - (state.deltaTo ?? m.snapshotBlock))} blocks</p><code>{m.expression}</code><p className="chip">{m.expression.includes('$creator') ? 'filtered by $creator' : '⚠ no $creator filter'}</p></>}{state.status === 'loading' && <p>Loading index…</p>}{(state.error || state.chainOk === false) && <p role="alert">{state.error ?? 'Chain identity mismatch'}</p>}</header>
}
