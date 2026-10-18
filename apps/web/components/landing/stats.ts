// One query for every landing figure, so the hero shows a single measured time.
// The windows match the Overview stat widgets in lib/views.ts (1800 blocks is one hour).
export const LANDING_STATS_SQL = `WITH h AS (SELECT block::DOUBLE AS head FROM live_head)
SELECT count(*) AS live,
 count(DISTINCT creator) AS creators,
 count(*) FILTER (WHERE expires_at::DOUBLE <= h.head + 1800) AS expiring,
 count(*) FILTER (WHERE created_at::DOUBLE >= greatest(0, h.head - 1800)) AS created
FROM entities, h`

export type LandingStats = { live: number; creators: number; expiring: number; created: number }

export function readLandingStats(data?: { columns: string[]; rows: unknown[][] }): LandingStats | undefined {
 const row = data?.rows[0]
 if (!data || !row) return undefined
 const get = (name: keyof LandingStats) => { const v = row[data.columns.indexOf(name)]; return v === null || v === undefined ? 0 : Number(v) }
 return { live: get('live'), creators: get('creators'), expiring: get('expiring'), created: get('created') }
}
