const entityColumns = `
  key VARCHAR, owner VARCHAR, creator VARCHAR,
  created_at UBIGINT, updated_at UBIGINT, expires_at UBIGINT,
  content_type VARCHAR, creation_flags INTEGER
`
const attributeColumns = 'key VARCHAR, name VARCHAR, type VARCHAR, value VARCHAR, num DOUBLE'

export const DELTA_TABLES = ['delta_entities', 'delta_attributes', 'delta_tombstones'] as const

export const LIVE_TABLES = ['live_entities', 'live_attributes', 'live_tombstones', 'live_pending'] as const

export const RAW_TABLES_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS base_entities (${entityColumns})`,
  `CREATE TABLE IF NOT EXISTS base_attributes (${attributeColumns})`,
  `CREATE TABLE IF NOT EXISTS delta_entities (${entityColumns})`,
  `CREATE TABLE IF NOT EXISTS delta_attributes (${attributeColumns})`,
  'CREATE TABLE IF NOT EXISTS delta_tombstones (key VARCHAR, block UBIGINT)',
  `CREATE TABLE IF NOT EXISTS live_entities (${entityColumns})`,
  `CREATE TABLE IF NOT EXISTS live_attributes (${attributeColumns})`,
  'CREATE TABLE IF NOT EXISTS live_tombstones (key VARCHAR, block UBIGINT)',
  'CREATE TABLE IF NOT EXISTS live_pending (key VARCHAR)',
  'CREATE TABLE IF NOT EXISTS live_head (block UBIGINT)',
]

// Rank complete sources before filtering expiry or deletion.
export const MERGE_VIEWS_SQL: string[] = [
  `CREATE OR REPLACE VIEW ranked_sources AS
    SELECT *, row_number() OVER (PARTITION BY key ORDER BY updated_at DESC, src DESC, deleted DESC) AS rn FROM (
      SELECT *, 0 AS src, false AS deleted FROM base_entities
      UNION ALL BY NAME SELECT *, 1 AS src, false AS deleted FROM delta_entities
      UNION ALL BY NAME SELECT key, block AS updated_at, 1 AS src, true AS deleted FROM delta_tombstones
      UNION ALL BY NAME SELECT *, 2 AS src, false AS deleted FROM live_entities
      UNION ALL BY NAME SELECT key, block AS updated_at, 2 AS src, true AS deleted FROM live_tombstones
    )`,
  `CREATE OR REPLACE VIEW winner AS SELECT * EXCLUDE (rn, deleted) FROM ranked_sources WHERE rn = 1 AND NOT deleted`,
  `CREATE OR REPLACE VIEW entities AS SELECT * EXCLUDE (src) FROM winner
    WHERE expires_at > (SELECT block FROM live_head)`,
  `CREATE OR REPLACE VIEW attribute_source AS
    SELECT w.key, CASE WHEN w.src = 2 AND EXISTS (SELECT 1 FROM live_pending p WHERE p.key = w.key)
      THEN (SELECT r.src FROM ranked_sources r WHERE r.key = w.key AND r.src < 2
        ORDER BY r.updated_at DESC, r.src DESC, r.deleted DESC LIMIT 1)
      ELSE w.src END AS src FROM winner w`,
  `CREATE OR REPLACE VIEW attributes AS
    SELECT a.* EXCLUDE (src) FROM (
      SELECT *, 0 AS src FROM base_attributes
      UNION ALL SELECT *, 1 AS src FROM delta_attributes
      UNION ALL SELECT *, 2 AS src FROM live_attributes
    ) a JOIN attribute_source w ON w.key = a.key AND w.src = a.src
    JOIN entities e ON e.key = a.key`,
]

export function setHeadSql(block: number): string[] {
  return ['DELETE FROM live_head', `INSERT INTO live_head VALUES (${block})`]
}

export function loadSnapshotSql(entitiesUrl: string, attributesUrl: string): string[] {
  const quote = (url: string) => `'${url.replaceAll("'", "''")}'`
  return [
    `CREATE OR REPLACE TABLE base_entities AS SELECT * FROM read_parquet(${quote(entitiesUrl)})`,
    `CREATE OR REPLACE TABLE base_attributes AS SELECT * FROM read_parquet(${quote(attributesUrl)})`,
  ]
}
