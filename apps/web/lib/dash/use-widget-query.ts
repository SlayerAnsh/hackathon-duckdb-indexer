'use client'
import type { WidgetPayload } from './schema'
import { checkWidgetSql } from './sql-guard'
import { useTimedQuery, type TimedResult } from '../use-query'

export function widgetQueryPlan(payload: WidgetPayload | null | undefined, enabled: boolean): { run: false; error?: string } | { run: true; sql: string } {
 if (!enabled || !payload) return { run: false }
 const error = checkWidgetSql(payload.sql)
 return error ? { run: false, error } : { run: true, sql: payload.sql }
}

export function useWidgetQuery(payload: WidgetPayload | null | undefined, version: number, enabled = true): TimedResult {
 const plan = widgetQueryPlan(payload, enabled)
 const result = useTimedQuery(plan.run ? plan.sql : '', version, { skip: !plan.run, maxRows: 5000 })
 return !plan.run && plan.error ? { loading: false, error: plan.error } : result
}
