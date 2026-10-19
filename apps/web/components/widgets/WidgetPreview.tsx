import type { WidgetPayload } from '../../lib/dash/schema'
import { sortRows, toChartWidget } from '../../lib/dash/chart'
import type { TimedResult } from '../../lib/use-query'
import { WidgetBody } from '../dash/WidgetCard'
import { CounterBody } from './CounterBody'

export function WidgetPreview({ payload, query, id }: { payload: WidgetPayload; query: TimedResult; id: string }) {
 const data = query.data && sortRows(query.data, payload.mapping)
 if (payload.chart === 'counter' && payload.counter && data && !query.error) return <CounterBody config={payload.counter} data={data}/>
 return <WidgetBody widget={toChartWidget(payload, id)} query={{ ...query, data }}/>
}
