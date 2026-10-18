// Frozen pre-materialization SQL for equivalence tests and the offline benchmark.
export const OLD_MERGE_VIEWS_SQL: string[] = [
  `CREATE OR REPLACE VIEW ranked_sources AS
    SELECT *, row_number() OVER (PARTITION BY key ORDER BY coalesce(attrs_pending, false), updated_at DESC, src DESC, deleted DESC) AS rn FROM (
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
        ORDER BY coalesce(r.attrs_pending, false), r.updated_at DESC, r.src DESC, r.deleted DESC LIMIT 1)
      ELSE w.src END AS src FROM winner w`,
  `CREATE OR REPLACE VIEW attributes AS
    SELECT a.* EXCLUDE (src) FROM (
      SELECT *, 0 AS src FROM base_attributes
      UNION ALL SELECT *, 1 AS src FROM delta_attributes
      UNION ALL SELECT *, 2 AS src FROM live_attributes
    ) a JOIN attribute_source w ON w.key = a.key AND w.src = a.src
    JOIN entities e ON e.key = a.key`,
]

