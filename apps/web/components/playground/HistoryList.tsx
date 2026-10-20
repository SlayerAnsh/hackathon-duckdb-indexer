import { formatMs } from '../../lib/format'
import type { HistoryEntry } from '../dash/QueryHistory'
import s from './playground.module.css'

export function HistoryList({ entries, onSelect }: { entries: HistoryEntry[]; onSelect: (sql: string) => void }) {
 if (!entries.length) return <div className={s.empty}><p className={s.emptyTitle}>No queries yet</p><p>Queries you run in this tab appear here. Click one to load it back into the editor.</p></div>
 return <ol className={s.history}>{entries.map((entry, i) => <li key={i}>
  <button type="button" onClick={() => onSelect(entry.sql)} title={entry.sql}>
   <code>{entry.sql.replace(/\s+/g, ' ').trim()}</code>
   <span className={s.historyMeta}><span>{formatMs(entry.ms)}</span><span>{entry.rows.toLocaleString('en-US')} {entry.rows === 1 ? 'row' : 'rows'}</span></span>
  </button>
 </li>)}</ol>
}
