"""Check indexed rows against the chain, the same rule as the web app's Verify button.

The index is a cache; the chain is the record. This script reads the most recently updated rows of
an indexer's current Parquet snapshot, asks a Rabdi RPC node for the same keys (one
`arkiv_query` for up to 50 keys, so about 100 units of the anonymous budget) and labels each row:

  ok        updatedAt and expiresAt match the chain
  stale     the chain changed the entity after the index saw it
  extended  the chain changed it and moved its expiry later
  expired   the chain reports an expiry at or below the current head
  deleted   the chain returns nothing for the key (deleted, or expired and gone)

Point it at an indexer started with SYNC_PAUSED=true on an old data directory and most rows come back
stale, extended or deleted. Usage: python3 examples/verify_against_chain.py [indexer base URL] [rows]

The labels are only as good as the RPC node asked. It defaults to the public Rabdi endpoint; set
ARKIV_RPC_URL to an endpoint you choose or to your own node to move that trust to a party you pick.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from collections import Counter

import duckdb

RPC = os.environ.get("ARKIV_RPC_URL") or "https://rpc.rabdi.db-chain.testnet.arkiv.network"
base = (sys.argv[1] if len(sys.argv) > 1 else "https://arkiv-sql-indexer.dokploy.anshudhar.dev").rstrip("/") + "/"
limit = min(int(sys.argv[2]) if len(sys.argv) > 2 else 50, 50)


def rpc(method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    # The RPC sits behind Cloudflare, which answers 403 to the default Python-urllib user agent.
    request = urllib.request.Request(RPC, body, {"content-type": "application/json", "user-agent": "arkiv-sql-indexer-example/1"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            reply = json.load(response)
    except urllib.error.HTTPError as error:
        # HTTP 429 ANON_COST_LIMITED means the anonymous hourly budget is spent; retry after Retry-After.
        sys.exit(f"{method} failed: HTTP {error.code} {error.read().decode(errors='replace')[:300]} retry-after={error.headers.get('retry-after')}")
    if "error" in reply:
        sys.exit(f"{method} failed: {reply['error']}")
    return reply["result"]


def classify(row, chain, head):
    # Same order as classifyVerify in apps/web/lib/verify.ts.
    if chain is None:
        return "deleted"
    if chain["expiresAt"] <= head:
        return "expired"
    if chain["updatedAt"] > row["updated_at"]:
        return "extended" if chain["expiresAt"] > row["expires_at"] else "stale"
    return "ok" if (chain["updatedAt"], chain["expiresAt"]) == (row["updated_at"], row["expires_at"]) else "stale"


with urllib.request.urlopen(base + "manifest.json", timeout=30) as response:
    manifest = json.load(response)
if manifest.get("schemaVersion", 1) != 1:
    sys.exit(f"unsupported schemaVersion {manifest['schemaVersion']}")

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
rows = [dict(zip(("key", "updated_at", "expires_at"), r)) for r in con.execute(
    "SELECT key, updated_at, expires_at FROM read_parquet(?) ORDER BY updated_at DESC, key LIMIT ?",
    [base + manifest["files"]["entities"], limit]).fetchall()]

expression = " OR ".join(f"$key = key({r['key']})" for r in rows)
result = rpc("arkiv_query", [expression, {"limit": "0xc8", "select": {"key": True, "updatedAt": True, "expiresAt": True}}])
head = int(rpc("eth_blockNumber", []), 16)
chain = {e["key"].lower(): {"updatedAt": int(e["updatedAt"], 16), "expiresAt": int(e["expiresAt"], 16)} for e in result["data"]}

labels = [(r, classify(r, chain.get(r["key"].lower()), head)) for r in rows]
print(f"index snapshot at block {manifest['snapshotBlock']}, chain head {head}, {head - manifest['snapshotBlock']} blocks behind")
print("labels:", dict(Counter(label for _, label in labels).most_common()))
for r, label in labels[:5]:
    c = chain.get(r["key"].lower())
    seen = f"chain updated {c['updatedAt']} expires {c['expiresAt']}" if c else "not on chain"
    print(f"  {label:<8} {r['key'][:18]}  index updated {r['updated_at']} expires {r['expires_at']}  {seen}")
