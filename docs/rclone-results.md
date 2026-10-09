# rclone results mount (SQL host)

Ops find offline search results on the **MSSQL host** via an **rclone**
mapped drive that mirrors the S3 results bucket. AWS workers still write
with the S3 API; the SQL box reads the same tree through the mount.

Canonical layout (LOCKED - matches `shared/resultsPath.js`):

```
{env}/{source}/{userId}/{catalogId}/{searchId}.json
```

## FR-124 LOCKED scheme (verified 2026-10-09)

| Knob | LOCKED default | Notes |
|------|----------------|-------|
| Drive letter | **`X:`** | Live SQL host mounts S3 as `X:` (volume "Madeira S3", WinFsp). **Ops may remap**; document the letter in the box runbook. Do not treat `S:` as the host default (older doc examples). |
| Mount shape | Account-level rclone remote | Root of `X:` lists buckets. `A_SEARCH_RCLONE_ROOT` **must include the bucket folder**. |
| S3 scheme | **One dedicated results bucket** with `live/` and `sandbox/` key prefixes | Matches `resultsKey` / workers. **Rejected as default:** two buckets (`...-live` / `...-sandbox`). |
| Legacy bucket | Do **not** reuse `madeira-results-bucket` root for a-search | That tree has no `live/`/`sandbox/` prefix (legacy `{source}/{club}/...`). Use a dedicated bucket or an `a-search/` top-level prefix so keys never mix with legacy. |

## Env vars (SQL host + workers)

| Variable | Who | Purpose |
|----------|-----|---------|
| `S3_RESULTS_BUCKET` | Workers (AWS) | Dedicated a-search results bucket name for `PutObject` |
| `A_SEARCH_RCLONE_ROOT` | SQL host / local tools | Absolute mount root **including bucket folder** (LOCKED example: `X:\<S3_RESULTS_BUCKET>`) |
| `A_SEARCH_ENV` | Workers / maintainer | `live` or `sandbox` - must match path prefix |

## Equivalent paths

Given `S3_RESULTS_BUCKET=a-search-results` and
`A_SEARCH_RCLONE_ROOT=X:\a-search-results`:

| Form | Example |
|------|---------|
| Logical key | `live/amazon/ABC12345/123/srch_01JEXAMPLE.json` |
| rclone path | `X:\a-search-results\live\amazon\ABC12345\123\srch_01JEXAMPLE.json` |
| S3 URI | `s3://a-search-results/live/amazon/ABC12345/123/srch_01JEXAMPLE.json` |

Sandbox swaps the first segment to `sandbox/` (separate tree - never mix).

Maintainer staging CSVs may land under
`{env}/_staging/{source}/{feedKey}/` on the same mount/bucket family.

## Ops checklist

1. Prefer a **dedicated** results bucket (or `a-search/` prefix) - not the legacy `madeira-results-bucket` root.
2. Install/keep rclone + WinFsp on the SQL host; remote can be account-level.
3. Mount under **`X:`** (or remapped letter); set `A_SEARCH_RCLONE_ROOT` to `X:\<bucket>`.
4. Ensure rclone **starts after reboot** (Windows service or scheduled task) - today it may be a plain process only.
5. Confirm a known `searchId` file appears under
   `{root}\{env}\{source}\{userId}\{catalogId}\{searchId}.json` after a sandbox
   accept.
6. Agents: see `.grok/skills/a-search-endpoint/SKILL.md` (poll after HTTP 200).
7. Never commit AWS keys or bucket credentials into git.

## Related

- `docs/environments.md` - live/sandbox isolation; **Results storage + rclone (FR-124)**; **Network path (FR-122)**
- `docs/endpoint-search.md` - accept contract
- `shared/resultsPath.js` - `resultsKey` / `resultsRclonePath` / `resultsS3Uri`
