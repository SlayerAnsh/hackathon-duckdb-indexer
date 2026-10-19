import { counterSummary, type ResultData } from '../../lib/dash/chart'
import type { CounterConfig } from '../../lib/dash/schema'
import s from '../showcase/showcase.module.css'

export function CounterBody({ config, data }: { config: CounterConfig; data: ResultData }) {
 const summary = counterSummary(config, data)
 if (!summary) return <p className="empty">No rows yet</p>
 return <div className={s.stat}><div className="stat-value">{summary.text}</div><div className={s.note}>{summary.label}</div></div>
}
