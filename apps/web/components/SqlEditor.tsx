'use client'
import { useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql, PostgreSQL } from '@codemirror/lang-sql'
import type { IndexDb } from '../lib/indexdb'
import { sqlCompletions } from '../lib/sql-complete'
export const EXAMPLES = [
 "SELECT e.key, e.updated_at, e.expires_at, a.value AS type FROM entities e JOIN attributes a ON e.key = a.key WHERE a.name = 'type'",
 "SELECT value, count(*) AS count FROM attributes WHERE name = 'type' GROUP BY value ORDER BY count DESC",
 "SELECT e.key, a.name, a.num FROM entities e JOIN attributes a ON e.key = a.key WHERE a.num IS NOT NULL ORDER BY a.num DESC",
]
export function SqlEditor({ db, value, onChange, onRun, running, error }: { db: IndexDb; value: string; onChange: (s: string) => void; onRun: () => void; running: boolean; error: string }) {
 const [schema, setSchema] = useState<Record<string,string[]>>({})
 const [functions, setFunctions] = useState<string[]>([])
 useEffect(() => { let active = true; void db.schema().then(s => { if (active) setSchema(s) }).catch(() => {}); void db.run('SELECT DISTINCT function_name FROM duckdb_functions() ORDER BY function_name', Infinity).then(r => { if (active) setFunctions(r.rows.map(row => String(row[0]))) }).catch(() => {}); return () => { active = false } }, [db])
 const extensions = useMemo(() => {
 const language = sql({ dialect: PostgreSQL, ...sqlCompletions(schema) })
 const autocomplete = (context: { matchBefore: (pattern: RegExp) => { from: number; text: string } | null; explicit: boolean }) => {
 const word = context.matchBefore(/\w*/)
 if (!word || (!word.text && !context.explicit)) return null
 return { from: word.from, options: functions.map(label => ({ label, type: 'function' })), validFor: /^\w*$/ }
 }
 return [language, language.language.data.of({ autocomplete })]
 }, [schema, functions])
 return <section id="sql-editor"><h2>SQL editor</h2><label>Examples <select defaultValue="" onChange={e => { if (e.target.value) onChange(e.target.value) }}><option value="" disabled>Select a query</option>{EXAMPLES.map((s,i) => <option key={s} value={s}>{['Join entities and attributes', 'Group by type', 'Order numeric attributes'][i]}</option>)}</select></label><div onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); if (!running) onRun() } }}><CodeMirror value={value} height="220px" extensions={extensions} onChange={onChange}/></div><button disabled={running} onClick={onRun}>Run · Ctrl / Cmd + Enter</button><button disabled={!running} onClick={() => void db.cancel()}>Cancel</button>{error && <p role="alert">{error}</p>}</section>
}
