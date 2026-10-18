export const TILES: { id: string; title: string; sql: string; kind: 'number' | 'bar' | 'line' | 'table' }[] = [
 { id: 'live', title: 'Live entities', kind: 'number', sql: 'SELECT count(*) AS count FROM entities' },
 { id: 'expiring_hour', title: 'Expiring in the next hour', kind: 'number', sql: 'SELECT count(*) AS count FROM entities WHERE expires_at <= (SELECT block FROM live_head) + 1800' },
 { id: 'by_type', title: 'Entities by type', kind: 'bar', sql: "SELECT value AS type, count(*) AS count FROM attributes WHERE name = 'type' GROUP BY value ORDER BY count DESC" },
 { id: 'created_per_hour', title: 'Creations per hour · last 24 hours', kind: 'line', sql: 'SELECT floor(created_at / 1800.0) AS hour, count(*) AS count FROM entities WHERE created_at >= greatest(0, (SELECT block::DOUBLE FROM live_head) - 43200) GROUP BY hour ORDER BY hour' },
 { id: 'expiry_horizon', title: 'Expiry horizon in hours', kind: 'bar', sql: 'SELECT floor((expires_at::DOUBLE - (SELECT block FROM live_head)) / 1800) AS hours, count(*) AS count FROM entities GROUP BY hours ORDER BY hours' },
 { id: 'top_creators', title: 'Top creators · $creator', kind: 'table', sql: 'SELECT creator, count(*) AS count FROM entities GROUP BY creator ORDER BY count DESC LIMIT 10' },
]
