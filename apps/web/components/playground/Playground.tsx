'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { VIEWS, DEFAULT_SQL } from '../../lib/views'
import { encodeSqlHash, readHash, writeHash } from '../../lib/hash-state'
import type { IndexDb } from '../../lib/indexdb'
import { ResultsGrid, type QueryResult } from '../dash/ResultsGrid'
import type { HistoryEntry } from '../dash/QueryHistory'
import { buildSnippets, matchSnippet, type Snippet } from './snippets'
import { SnippetSidebar } from './SnippetSidebar'
import { HistoryList } from './HistoryList'
import { useDocumentTheme, useSqlEditor } from './useSqlEditor'
import s from './playground.module.css'

const GROUPS = buildSnippets(VIEWS, DEFAULT_SQL)
const SNIPPETS = new Map(GROUPS.flatMap(g => g.snippets.map(sn => [sn.id, sn] as const)))

export function Playground({ db, rpcUrl, head }: { db: IndexDb | null; rpcUrl: string; head?: number }) {
 const [sql, setSql] = useState(DEFAULT_SQL)
 const [activeId, setActiveId] = useState<string | null>('featured/default')
 const [drawer, setDrawer] = useState(false)
 const [tab, setTab] = useState<'results' | 'history'>('results')
 const [running, setRunning] = useState(false)
 const [error, setError] = useState('')
 const [copied, setCopied] = useState(false)
 const [history, setHistory] = useState<HistoryEntry[]>([])
 const [result, setResult] = useState<{ data: QueryResult; sql: string; ms: number; head?: number; id: number }>()
 const editor = useRef<ReactCodeMirrorRef>(null)
 const sqlRef = useRef(sql)
 useEffect(() => { sqlRef.current = sql })

 const load = useCallback((next: string, id: string | null) => { setSql(next); setActiveId(id) }, [])
 useEffect(() => {
  const restore = () => { const saved = readHash(); if (saved) load(saved, matchSnippet(GROUPS, saved)) }
  restore()
  window.addEventListener('hashchange', restore); window.addEventListener('popstate', restore)
  return () => { window.removeEventListener('hashchange', restore); window.removeEventListener('popstate', restore) }
 }, [load])

 useEffect(() => {
  if (!drawer) return
  document.querySelector<HTMLInputElement>('#pg-snippets input[type="search"]')?.focus()
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false) }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
 }, [drawer])

 const run = useCallback(async () => {
  const query = sqlRef.current
  if (!db || running || !query.trim()) return
  setRunning(true); setError(''); setTab('results'); writeHash(query)
  try {
   const data = await db.run(query)
   setResult(prev => ({ data, sql: query, ms: data.elapsedMs, head, id: (prev?.id ?? 0) + 1 }))
   setHistory(prev => [{ sql: query, ms: data.elapsedMs, rows: data.rows.length }, ...prev.filter(h => h.sql !== query)].slice(0, 30))
  } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setRunning(false) }
 }, [db, running, head])
 const { schema, extensions } = useSqlEditor(db, () => void run())
 const theme = useDocumentTheme()

 function pick(snippet: Snippet) { load(snippet.sql, snippet.id); writeHash(snippet.sql); setDrawer(false); editor.current?.view?.focus() }
 function insert(text: string) {
  const view = editor.current?.view
  if (!view) { setSql(prev => prev + text); return }
  view.dispatch(view.state.replaceSelection(text)); view.focus(); setDrawer(false)
 }
 async function copyLink() {
  try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${encodeSqlHash(sql)}`); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { setCopied(false) }
 }

 const active = activeId ? SNIPPETS.get(activeId) : undefined
 const edited = !!active && active.sql.trim() !== sql.trim()
 const label = useMemo(() => active ? active.title : 'Custom query', [active])

 return <div className={s.shell}>
  <SnippetSidebar id="pg-snippets" groups={GROUPS} activeId={activeId} edited={edited} schema={schema} open={drawer} onClose={() => setDrawer(false)} onPick={pick} onInsert={insert}/>
  {drawer && <div className={s.backdrop} onClick={() => setDrawer(false)} aria-hidden="true"/>}
  <main className={s.main}>
   <header className={s.head}>
    <button className={`btn ${s.drawerBtn}`} onClick={() => setDrawer(true)} aria-controls="pg-snippets" aria-expanded={drawer}>☰ Snippets</button>
    <div className={s.headText}>
     <h1>SQL playground</h1>
     <p>Full SQL over the live Arkiv index. Every query runs in DuckDB inside this tab.</p>
    </div>
   </header>

   <section className={s.editorCard} aria-label="SQL editor">
    <div className={s.runbar}>
     <div className={s.loaded}>
      <span className={s.loadedLabel}>{active ? 'Snippet' : 'Editor'}</span>
      <span className={s.loadedTitle} title={label}>{label}</span>
      {edited && <span className={s.edited}>edited</span>}
     </div>
     <span className={s.hint}><kbd>Ctrl</kbd> or <kbd>⌘</kbd> + <kbd>Enter</kbd></span>
     <button className="btn btn-quiet" onClick={() => void copyLink()} aria-live="polite">{copied ? '✓ Link copied' : 'Copy link'}</button>
     <button className="btn" disabled={!db || !running} onClick={() => void db?.cancel().catch(e => setError(String(e)))}>Cancel</button>
     <button className="btn btn-primary" disabled={!db || running || !sql.trim()} onClick={() => void run()}>{running ? 'Running…' : db ? '▶ Run' : 'Loading index…'}</button>
    </div>
    <div className={s.editor}>
     <CodeMirror ref={editor} className={s.cm} aria-label="SQL query" value={sql} height="100%" theme={theme} extensions={extensions} onChange={next => setSql(next)} basicSetup={{ foldGutter: false }}/>
    </div>
   </section>

   <section className={s.resultsCard} aria-label="Query output">
    <div className={s.tabs} role="tablist" aria-label="Query output">
     <button role="tab" id="pg-tab-results" aria-controls="pg-panel" aria-selected={tab === 'results'} onClick={() => setTab('results')}>Results{result && <span>{result.data.rows.length.toLocaleString()}{result.data.truncated ? '+' : ''}</span>}</button>
     <button role="tab" id="pg-tab-history" aria-controls="pg-panel" aria-selected={tab === 'history'} onClick={() => setTab('history')}>History<span>{history.length}</span></button>
     {running && <span className={s.busy} role="status">Running query…</span>}
    </div>
    <div className={s.panel} id="pg-panel" role="tabpanel" aria-labelledby={tab === 'results' ? 'pg-tab-results' : 'pg-tab-history'}>
     {tab === 'history'
      ? <HistoryList entries={history} onSelect={next => { load(next, matchSnippet(GROUPS, next)); editor.current?.view?.focus() }}/>
      : <>
       {error && <p className={s.error} role="alert"><b>Query failed.</b> {error}</p>}
       {db && result ? <ResultsGrid key={result.id} result={result.data} db={db} sql={result.sql} rpcUrl={rpcUrl} ms={result.ms} head={result.head}/>
        : !error && <p className={s.empty}>{db ? <>Pick a snippet or write your own SQL, then press <b>Run</b>.</> : 'Loading the index into your browser…'}</p>}
      </>}
    </div>
   </section>
  </main>
 </div>
}
