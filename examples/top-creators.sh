#!/bin/sh
# Top creators of live Arkiv entities, read straight from a hosted indexer with the DuckDB CLI.
# No web app, no API key, no RPC: the manifest names the current Parquet snapshot, DuckDB reads it over HTTPS.
# Usage: ./examples/top-creators.sh [indexer base URL]
set -eu
BASE="${1:-https://arkiv-sql-indexer.dokploy.anshudhar.dev}"
BASE="${BASE%/}/"
SUPPORTED=1
duckdb -c "
INSTALL httpfs; LOAD httpfs;
SET VARIABLE base = '$BASE';
SET VARIABLE manifest = (SELECT content::JSON FROM read_text(getvariable('base') || 'manifest.json'));
-- A manifest without schemaVersion predates versioning and reads as 1. Refuse any other version.
SELECT CASE WHEN coalesce((getvariable('manifest') ->> 'schemaVersion')::INTEGER, 1) = $SUPPORTED
  THEN 'schemaVersion ' || coalesce(getvariable('manifest') ->> 'schemaVersion', '1 (absent)') || ', snapshot v' || (getvariable('manifest') ->> 'version') || ' at block ' || (getvariable('manifest') ->> 'snapshotBlock')
  ELSE error('unsupported schemaVersion ' || (getvariable('manifest') ->> 'schemaVersion')) END AS manifest;
SELECT creator, count(*) AS live_entities
FROM read_parquet(getvariable('base') || (getvariable('manifest') -> 'files' ->> 'entities'))
WHERE expires_at > (getvariable('manifest') ->> 'snapshotBlock')::UBIGINT
GROUP BY creator ORDER BY live_entities DESC, creator LIMIT 10;
"
