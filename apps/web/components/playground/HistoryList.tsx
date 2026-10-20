import { formatMs } from '../../lib/format'
import s from './playground.module.css'

/** One run in the playground history. `error` marks a failed run and holds its notice title. */
export type HistoryEntry = { sql: string; ms: number; rows: number; error?: string }

export function HistoryList({ entries, onSelect }: { entries: HistoryEntry[]; onSelect: (sql: string) => void }) {
 if (!entries.length) return <div className={s.empty}><p className={s.emptyTitle}>No queries yet</p><p>Queries you run in this tab appear here. Click one to load it back into the editor.</p></div>
 return <ol className={s.history}>{entries.map((entry, i) => <li key={i}>
  <button type="button" onClick={() => onSelect(entry.sql)} title={entry.sql}>
   <code>{entry.sql.replace(/\s+/g, ' ').trim()}</code>
   <span className={s.historyMeta}><span>{formatMs(entry.ms)}</span>{entry.error ? <span className={s.historyFail}>{entry.error}</span> : <span>{entry.rows.toLocaleString('en-US')} {entry.rows === 1 ? 'row' : 'rows'}</span>}</span>
  </button>
 </li>)}</ol>
}
