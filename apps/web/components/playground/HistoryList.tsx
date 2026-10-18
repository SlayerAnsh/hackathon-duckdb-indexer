import { formatMs } from '../../lib/format'
import type { HistoryEntry } from '../dash/QueryHistory'
import s from './playground.module.css'

export function HistoryList({ entries, onSelect }: { entries: HistoryEntry[]; onSelect: (sql: string) => void }) {
 if (!entries.length) return <p className={s.empty}>Queries you run in this tab appear here. Click one to load it back into the editor.</p>
 return <ol className={s.history}>{entries.map((entry, i) => <li key={i}>
  <button onClick={() => onSelect(entry.sql)} title={entry.sql}>
   <code>{entry.sql.replace(/\s+/g, ' ').trim()}</code>
   <span className={s.historyMeta}><span aria-hidden="true">ϟ</span> {formatMs(entry.ms)}<span>{entry.rows.toLocaleString()} rows</span></span>
  </button>
 </li>)}</ol>
}
