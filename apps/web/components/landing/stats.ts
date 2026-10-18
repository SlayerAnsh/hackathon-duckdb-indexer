// One query per landing figure, so each figure shows its own measured time and the hero shows their average.
// The windows match the Overview stat widgets in lib/views.ts (1800 blocks is one hour).
export type LandingStats = { live: number; creators: number; expiring: number; created: number }

export const FIGURE_SQL: Record<keyof LandingStats, string> = {
 live: 'SELECT count(*) AS value FROM entities',
 creators: 'SELECT count(DISTINCT creator) AS value FROM entities',
 expiring: 'SELECT count(*) AS value FROM entities WHERE expires_at::DOUBLE <= (SELECT block::DOUBLE FROM live_head) + 1800',
 created: 'SELECT count(*) AS value FROM entities WHERE created_at::DOUBLE >= greatest(0, (SELECT block::DOUBLE FROM live_head) - 1800)',
}

export function readFigure(data?: { columns: string[]; rows: unknown[][] }): number | undefined {
 const row = data?.rows[0]
 if (!data || !row) return undefined
 const v = row[data.columns.indexOf('value')]
 return v === null || v === undefined ? 0 : Number(v)
}

export function averageMs(times: (number | undefined)[]): number | undefined {
 const measured = times.filter((t): t is number => t !== undefined)
 return measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : undefined
}
