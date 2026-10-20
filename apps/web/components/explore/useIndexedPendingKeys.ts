'use client'
import { useMemo } from 'react'
import { indexedKeysSql } from '../../lib/dash/explore-counts'
import type { PendingWrite } from '../../lib/dash/pending'
import { useTimedQuery } from '../../lib/use-query'

/** Which pending write keys the index already counts. Undefined while unknown. */
export function useIndexedPendingKeys(pending: PendingWrite[], version: number): Set<string> | undefined {
 const sql = indexedKeysSql(pending.filter(write => write.kind !== 'link').map(write => write.key))
 const result = useTimedQuery(sql, version, { skip: !sql })
 const rows = sql ? result.data?.rows : []
 return useMemo(() => rows ? new Set(rows.map(row => String(row[0]).toLowerCase())) : undefined, [rows])
}
