'use client'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { VIEWS, DEFAULT_SQL } from '../../lib/views'
import { encodeSqlHash, readHash, writeHash } from '../../lib/hash-state'
import type { IndexDb } from '../../lib/indexdb'
import { ResultsGrid, type QueryResult } from '../dash/ResultsGrid'
import { buildSnippets, matchSnippet, type Snippet } from './snippets'
import { SnippetSidebar } from './SnippetSidebar'
import { HistoryList, type HistoryEntry } from './HistoryList'
import { useDocumentTheme, useSqlEditor } from './useSqlEditor'
import { CheckIcon, LinkIcon, ListIcon, PlayIcon, StopIcon } from './icons'
import s from './playground.module.css'
import { cx } from '../dash/cx'

const noSubscribe = () => () => {}
/** Shortcut modifier label for this platform; Ctrl on the server and non Apple devices. */
const platformMod = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'
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
 const mod = useSyncExternalStore(noSubscribe, platformMod, () => 'Ctrl')
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
  <main id="main" className={s.main}>
   <header className={s.head}>
    <div className={s.headText}>
     <h1>SQL playground</h1>
     <p>Full SQL over the live Arkiv index. Every query runs in DuckDB inside this tab.</p>
    </div>
    <button type="button" className={cx('btn', 'btn-outline', s.drawerBtn)} onClick={() => setDrawer(true)} aria-controls="pg-snippets" aria-expanded={drawer}><ListIcon/>Snippets</button>
   </header>

   <section className={s.editorCard} aria-label="SQL editor">
    <div className={s.runbar}>
     <div className={s.loaded}>
      <span className={s.loadedLabel}>{active ? 'Snippet' : 'Editor'}</span>
      <span className={s.loadedTitle} title={label}>{label}</span>
      {edited && <span className={s.edited}>edited</span>}
     </div>
     <div className={s.runActions}>
      <span className={s.hint} aria-hidden="true"><kbd>{mod}</kbd><kbd>Enter</kbd></span>
      <button type="button" className={cx('btn', 'btn-quiet', s.copyBtn)} onClick={() => void copyLink()} aria-live="polite">{copied ? <><CheckIcon/>Link copied</> : <><LinkIcon/>Copy link</>}</button>
      {running && <button type="button" className="btn btn-outline" disabled={!db} onClick={() => void db?.cancel().catch(e => setError(String(e)))}><StopIcon/>Cancel</button>}
      <button type="button" className={cx('btn', 'btn-primary', s.runBtn)} disabled={!db || running || !sql.trim()} aria-busy={running || !db || undefined} aria-keyshortcuts="Control+Enter Meta+Enter" onClick={() => void run()}>{running ? <><span className="spinner" aria-hidden="true"/>Running…</> : db ? <><PlayIcon/>Run</> : <><span className="spinner" aria-hidden="true"/>Loading index…</>}</button>
     </div>
    </div>
    <div className={s.editor}>
     <CodeMirror ref={editor} className={s.cm} aria-label="SQL query" value={sql} height="100%" theme={theme} extensions={extensions} onChange={next => setSql(next)} basicSetup={{ foldGutter: false }}/>
    </div>
   </section>

   <section className={s.resultsCard} aria-label="Query output" aria-busy={running || undefined}>
    <div className={s.tabs} role="tablist" aria-label="Query output">
     <button type="button" role="tab" id="pg-tab-results" aria-controls="pg-panel" aria-selected={tab === 'results'} onClick={() => setTab('results')}>Results{result && <span className={s.tabCount}>{result.data.rows.length.toLocaleString('en-US')}{result.data.truncated ? '+' : ''}</span>}</button>
     <button type="button" role="tab" id="pg-tab-history" aria-controls="pg-panel" aria-selected={tab === 'history'} onClick={() => setTab('history')}>History<span className={s.tabCount}>{history.length}</span></button>
     {running && <span className={s.busy} role="status"><span className="spinner" aria-hidden="true"/>Running query</span>}
     {running && <span className={s.progress} aria-hidden="true"/>}
    </div>
    <div className={s.panel} id="pg-panel" role="tabpanel" aria-labelledby={tab === 'results' ? 'pg-tab-results' : 'pg-tab-history'} data-running={running || undefined}>
     {tab === 'history'
      ? <HistoryList entries={history} onSelect={next => { load(next, matchSnippet(GROUPS, next)); editor.current?.view?.focus() }}/>
      : <>
       {error && <div className={cx('notice', 'notice-bad', s.error)} role="alert"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M8 4.75v3.75M8 11h.01"/></svg><div><p className="notice-title">Query failed</p><pre className={s.errorText}>{error}</pre></div></div>}
       {db && result ? <div className={s.result}><ResultsGrid key={result.id} result={result.data} db={db} sql={result.sql} rpcUrl={rpcUrl} ms={result.ms} head={result.head}/></div>
        : !error && (db
         ? <div className={s.empty}><p className={s.emptyTitle}>No results yet</p><p>Pick a snippet or write your own SQL, then press <b>Run</b> or <kbd>{mod}</kbd> <kbd>Enter</kbd>.</p></div>
         : <div className={s.loadingState} role="status"><div className={s.skelTable} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} className={s.skelRow}><span className="skel"/><span className="skel"/><span className="skel"/><span className="skel"/></span>)}</div><p>Loading the index into your browser…</p></div>)}
      </>}
    </div>
   </section>
  </main>
 </div>
}
