const entityColumns = `
  key VARCHAR, owner VARCHAR, creator VARCHAR,
  created_at UBIGINT, updated_at UBIGINT, expires_at UBIGINT,
  content_type VARCHAR, creation_flags INTEGER
`
const attributeColumns = 'key VARCHAR, name VARCHAR, type VARCHAR, value VARCHAR, num DOUBLE'

export const DELTA_TABLES = ['delta_entities', 'delta_attributes', 'delta_tombstones'] as const

export const RAW_TABLES_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS base_entities (${entityColumns})`,
  `CREATE TABLE IF NOT EXISTS base_attributes (${attributeColumns})`,
  `CREATE TABLE IF NOT EXISTS delta_entities (${entityColumns})`,
  `CREATE TABLE IF NOT EXISTS delta_attributes (${attributeColumns})`,
  'CREATE TABLE IF NOT EXISTS delta_tombstones (key VARCHAR, block UBIGINT)',
  'CREATE TABLE IF NOT EXISTS live_head (block UBIGINT)',
]

// Delta contains the latest state per changed key, so its presence alone wins.
export const MERGE_VIEWS_SQL: string[] = [
  `CREATE OR REPLACE VIEW winner AS
    SELECT b.*, 0 AS src FROM base_entities b
    WHERE NOT EXISTS (SELECT 1 FROM delta_entities d WHERE d.key = b.key)
      AND NOT EXISTS (SELECT 1 FROM delta_tombstones t WHERE t.key = b.key)
    UNION ALL
    SELECT d.*, 1 AS src FROM delta_entities d
    WHERE NOT EXISTS (SELECT 1 FROM delta_tombstones t WHERE t.key = d.key)`,
  `CREATE OR REPLACE VIEW entities AS
    SELECT * EXCLUDE (src) FROM winner
    WHERE expires_at > (SELECT block FROM live_head)`,
  `CREATE OR REPLACE VIEW attributes AS
    SELECT a.* FROM base_attributes a
    JOIN winner w ON w.key = a.key AND w.src = 0
    JOIN entities e ON e.key = a.key
    UNION ALL
    SELECT a.* FROM delta_attributes a
    JOIN winner w ON w.key = a.key AND w.src = 1
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
