import { expect, test } from 'bun:test'
import { nativeDb } from './dash-duckdb'
import { DASH_PROJECT } from '../lib/dash/schema'
import { OFFICIAL_LOGIN, officialExpr } from '../lib/dash/official'
import { dashCte, officialSql, dashboardListSql, dashboardCountSql, toDashboardItems, type DashboardListQuery } from '../lib/dash/sql'

// The attack from README "Why this pillar": a second wallet copies every attribute of the Featured
// dashboard `network-overview`. Only the chain set creator differs.
const W = '0x' + '1f'.repeat(20), A = '0x' + 'a7'.repeat(20)
const key = (n: number) => '0x' + n.toString(16).padStart(64, '0')
const featured = { project: DASH_PROJECT, type: 'dashboard', user: W, login: OFFICIAL_LOGIN, slug: 'network-overview', title: 'Arkiv network overview' }
const rows = [
 { key: key(1), creator: W, owner: W, attrs: featured },
 // Forgery kept by the attacker.
 { key: key(2), creator: A, owner: A, attrs: featured },
 // Forgery the attacker then transferred to the app wallet, so `$owner` matches too.
 { key: key(3), creator: A, owner: W, attrs: featured },
]
const q: DashboardListQuery = { search: '', sort: 'newest', official: true, limit: 12, offset: 0 }

test('a dashboard forged by another wallet with user = app wallet, login arkiv and slug network-overview is never Featured', async () => {
 const { db, close } = await nativeDb(rows)
 try {
  const keys = async (sql: string) => (await db.runAndReadAll(sql)).getRowObjects().map(r => String(r.key))
  expect(await keys(`${dashCte(W)} SELECT key FROM dash d WHERE ${officialSql('d', W)} ORDER BY key`)).toEqual([key(1)])
  expect(await keys(dashboardListSql(W, q))).toEqual([key(1)])
  // The forgeries are not merely un-Featured: they are absent from every dashboard list.
  expect(await keys(dashboardListSql(W, { ...q, official: false }))).toEqual([key(1)])
  expect(Number((await db.runAndReadAll(dashboardCountSql(W, q))).getRowObjects()[0]!.n)).toBe(1)
  expect(toDashboardItems((await db.runAndReadAll(dashboardListSql(W, q))).getRows())).toMatchObject([{ key: key(1), official: true, user: W }])
 } finally { close() }
})

test('the RPC side of the same rule filters on the chain set $creator and $owner', () => {
 const expr = officialExpr(W).toLowerCase()   // the SDK renders checksummed addresses
 expect(expr).toContain(`$creator = addr(${W})`)
 expect(expr).toContain(`$owner = addr(${W})`)
 expect(expr).toContain(`user = addr(${W})`)
})
