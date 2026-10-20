import type { WidgetPayload } from '../../lib/dash/schema'
import { sortRows, toChartWidget, histogramData, stackReady } from '../../lib/dash/chart'
import type { TimedResult } from '../../lib/use-query'
import { WidgetBody } from '../dash/WidgetCard'
import { CounterBody } from './CounterBody'
import w from './widgets.module.css'

export function WidgetPreview({ payload, query, id }: { payload: WidgetPayload; query: TimedResult; id: string }) {
 let data = query.data && sortRows(query.data, payload.mapping)
 if (payload.chart === 'stacked-bar' && !stackReady(payload.mapping)) return <p className="empty">Pick a Group by column or a second Y column to stack.</p>
 const count = data?.rows.length
 if (payload.chart === 'histogram' && data) data = histogramData(data, payload.mapping.x ?? '', payload.mapping.bins ?? 20, payload.format.number)
 if (payload.chart === 'counter' && payload.counter && data && !query.error) return <CounterBody config={payload.counter} data={data}/>
 return <><WidgetBody widget={toChartWidget(payload, id)} query={{ ...query, data }}/>{payload.chart === 'histogram' && count !== undefined && !query.error && <p className={w.binned}>Binned from {count} rows</p>}</>
}
