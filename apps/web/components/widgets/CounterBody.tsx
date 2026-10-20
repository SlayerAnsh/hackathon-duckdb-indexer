import { counterSummary, type ResultData } from '../../lib/dash/chart'
import type { CounterConfig } from '../../lib/dash/schema'
import s from '../dash/charts.module.css'
import { cx } from '../dash/cx'

export function CounterBody({ config, data }: { config: CounterConfig; data: ResultData }) {
 const summary = counterSummary(config, data)
 if (!summary) return <p className={cx('empty', s.emptyInline)}>No rows yet<span className={s.emptyHint}>{config.column ? `No number in ${config.column}, row ${config.row + 1}` : 'Pick a value column'}</span></p>
 return <div className={s.counter}><div className={cx('stat-value', s.counterValue)} title={summary.text}>{summary.text}</div>{summary.label && <div className={s.counterLabel}>{summary.label}</div>}</div>
}
