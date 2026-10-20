"""Top creators of live Arkiv entities, read straight from a hosted indexer with the duckdb package.

No web app, no API key, no RPC: the manifest names the current Parquet snapshot and DuckDB reads it
over HTTPS. Usage: python3 examples/top_creators.py [indexer base URL]
"""
import json
import sys
import urllib.request

import duckdb

SUPPORTED_SCHEMA = 1
base = (sys.argv[1] if len(sys.argv) > 1 else "https://arkiv-sql-indexer.dokploy.anshudhar.dev").rstrip("/") + "/"

with urllib.request.urlopen(base + "manifest.json", timeout=30) as response:
    manifest = json.load(response)
# A manifest without schemaVersion predates versioning and reads as 1. Refuse any other version.
schema = manifest.get("schemaVersion", 1)
if schema != SUPPORTED_SCHEMA:
    sys.exit(f"unsupported schemaVersion {schema}, this script reads {SUPPORTED_SCHEMA}")
print(f"schemaVersion {schema}{'' if 'schemaVersion' in manifest else ' (absent)'}, "
      f"snapshot v{manifest['version']} at block {manifest['snapshotBlock']}, chain {manifest['chainId']}")

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
rows = con.execute(
    """
    SELECT creator, count(*) AS live_entities
    FROM read_parquet(?)
    WHERE expires_at > ?
    GROUP BY creator ORDER BY live_entities DESC, creator LIMIT 10
    """,
    [base + manifest["files"]["entities"], manifest["snapshotBlock"]],
).fetchall()
for creator, count in rows:
    print(f"{creator}  {count:>6}")
