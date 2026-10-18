'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorView, Prec, keymap, type Extension } from '@uiw/react-codemirror'
import { sql as sqlLanguage, PostgreSQL } from '@codemirror/lang-sql'
import { sqlCompletions } from '../../lib/sql-complete'
import type { IndexDb } from '../../lib/indexdb'

/** Tracks `data-theme` on the root element, which ThemeToggle owns. */
export function useDocumentTheme(): 'dark' | 'light' {
 const [theme, setTheme] = useState<'dark' | 'light'>('dark')
 useEffect(() => {
  const root = document.documentElement
  const read = () => setTheme(root.dataset.theme === 'light' ? 'light' : 'dark')
  read()
  const observer = new MutationObserver(read)
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
 }, [])
 return theme
}

/** Editor chrome follows the design tokens so it matches both themes. */
const tokenTheme = Prec.highest(EditorView.theme({
 '&': { backgroundColor: 'var(--inset)', color: 'var(--text)', fontSize: '13px' },
 '&.cm-focused': { outline: 'none' },
 '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.7' },
 '.cm-content': { padding: '16px 0' },
 '.cm-gutters': { backgroundColor: 'var(--inset)', color: 'var(--text-3)', borderRight: '1px solid var(--border)' },
 '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent) 7%, transparent)' },
 '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-2)' },
 '.cm-tooltip': { backgroundColor: 'var(--card-2)', border: '1px solid var(--border-strong)', borderRadius: '8px', overflow: 'hidden' },
 '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' },
}))

/** Schema and function autocomplete for the live index, plus Mod+Enter bound to `onRun`. */
export function useSqlEditor(db: IndexDb | null, onRun?: () => void) {
 const [schema, setSchema] = useState<Record<string, string[]>>({})
 const [functions, setFunctions] = useState<string[]>([])
 const runRef = useRef(onRun)
 useEffect(() => { runRef.current = onRun })
 useEffect(() => {
  if (!db) return
  let active = true
  void db.schema().then(s => { if (active) setSchema(s) }).catch(() => {})
  void db.run('SELECT DISTINCT function_name FROM duckdb_functions() ORDER BY function_name', Infinity).then(r => { if (active) setFunctions(r.rows.map(row => String(row[0]))) }).catch(() => {})
  return () => { active = false }
 }, [db])
 const extensions = useMemo<Extension[]>(() => {
  const language = sqlLanguage({ dialect: PostgreSQL, ...sqlCompletions(schema) })
  const autocomplete = (context: { matchBefore: (pattern: RegExp) => { from: number; text: string } | null; explicit: boolean }) => {
   const word = context.matchBefore(/\w*/)
   if (!word || (!word.text && !context.explicit)) return null
   return { from: word.from, options: functions.map(label => ({ label, type: 'function' })), validFor: /^\w*$/ }
  }
  const run = Prec.highest(keymap.of([{ key: 'Mod-Enter', preventDefault: true, run: () => { runRef.current?.(); return true } }]))
  return [language, language.language.data.of({ autocomplete }), run, tokenTheme]
 }, [schema, functions])
 return { schema, extensions }
}
