'use client'
import { useMemo, useState } from 'react'
import { NotInArkivQueryBadge } from '../dash/NotInArkivQueryBadge'
import { filterSnippets, snippetCount, type Snippet, type SnippetGroup } from './snippets'
import s from './playground.module.css'

/** Columns shown before the browser database reports its schema. */
const FALLBACK_SCHEMA: Record<string, string[]> = {
 entities: ['key', 'owner', 'creator', 'created_at', 'updated_at', 'expires_at', 'content_type', 'creation_flags'],
 attributes: ['key', 'name', 'type', 'value', 'num'],
}
const TABLE_NOTES: Record<string, string> = {
 entities: 'One row per live entity. Block numbers, lowercase hex.',
 attributes: 'One row per entity attribute. num is set for numeric types.',
}

export function SnippetSidebar({ id, groups, activeId, edited, schema, open, onClose, onPick, onInsert }: {
 id: string; groups: SnippetGroup[]; activeId: string | null; edited: boolean; schema: Record<string, string[]>; open: boolean
 onClose: () => void; onPick: (snippet: Snippet) => void; onInsert: (text: string) => void
}) {
 const [query, setQuery] = useState('')
 const visible = useMemo(() => filterSnippets(groups, query), [groups, query])
 const total = snippetCount(groups), shown = snippetCount(visible)
 const tables = Object.entries(Object.values(schema).some(c => c.length) ? schema : FALLBACK_SCHEMA)
 return <aside id={id} className={s.side} data-open={open || undefined} aria-label="Snippets and schema">
  <div className={s.sideHead}>
   <div className={s.sideTitle}>
    <h2>Snippets</h2>
    <span className={s.count}>{query ? `${shown} of ${total}` : total}</span>
    <button className={s.close} onClick={onClose} aria-label="Close snippets">✕</button>
   </div>
   <label className={s.searchBox}>
    <span aria-hidden="true">⌕</span>
    <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title or SQL" aria-label="Search snippets by title or SQL"/>
   </label>
  </div>
  <nav className={s.sideScroll} aria-label="Snippets">
   {visible.map(group => <section key={group.id} className={s.group} aria-labelledby={`g-${group.id}`}>
    <h3 id={`g-${group.id}`}>{group.title}<span>{group.snippets.length}</span></h3>
    <ul>{group.snippets.map(sn => {
     const active = sn.id === activeId
     return <li key={sn.id}>
      <button className={s.card} aria-current={active ? 'true' : undefined} onClick={() => onPick(sn)} title={`Load "${sn.title}" into the editor`}>
       <span className={s.cardTop}><span className={s.cardTitle}>{sn.title}</span>{active && edited && <span className={s.edited}>edited</span>}</span>
       <span className={s.cardSub}>{sn.subtitle}</span>
       <code className={s.cardSql}>{sn.preview}</code>
       {sn.notInArkivQuery && <span className={s.cardBadge}><NotInArkivQueryBadge reason={sn.notInArkivQuery}/></span>}
      </button>
     </li>
    })}</ul>
   </section>)}
   {!visible.length && <p className={s.none}>No snippets match <b>{query}</b>. Try a table or function name.</p>}
  </nav>
  <details className={s.schema}>
   <summary><span className={s.chev} aria-hidden="true">›</span>Schema<span className={s.count}>{tables.length} tables</span></summary>
   <div className={s.schemaBody}>
    <p className={s.schemaHint}>Click a name to insert it at the cursor.</p>
    {tables.map(([table, columns]) => <div key={table} className={s.table}>
     <button className={s.tableName} onClick={() => onInsert(table)} title={TABLE_NOTES[table]}>{table}</button>
     {TABLE_NOTES[table] && <p className={s.tableNote}>{TABLE_NOTES[table]}</p>}
     <ul className={s.cols}>{columns.map(c => <li key={c}><button onClick={() => onInsert(c)} aria-label={`Insert column ${table}.${c}`}>{c}</button></li>)}</ul>
    </div>)}
   </div>
  </details>
 </aside>
}
