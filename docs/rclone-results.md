# rclone results mount (SQL host)

Ops find offline search results on the **MSSQL host** via an **rclone**
mapped drive that mirrors the S3 results bucket. AWS workers still write
with the S3 API; the SQL box reads the same tree through the mount.

Canonical layout (LOCKED â€” matches `shared/resultsPath.js`):

```
{env}/{source}/{userId}/{catalogId}/{searchId}.json
```

## Env vars (SQL host + workers)

| Variable | Who | Purpose |
|----------|-----|---------|
| `S3_RESULTS_BUCKET` | Workers (AWS) | Bucket name for `PutObject` |
| `A_SEARCH_RCLONE_ROOT` | SQL host / local tools | Absolute mount root (e.g. `S:\a-search`) |
| `A_SEARCH_ENV` | Workers / maintainer | `live` or `sandbox` â€” must match path prefix |

Drive letter and rclone remote name are **deploy-specific** (vision UNKNOWN).
Document the chosen letter in the box runbook; do not hard-code secrets.

## Equivalent paths

Given `A_SEARCH_RCLONE_ROOT=S:\a-search` and
`S3_RESULTS_BUCKET=my-a-search-results`:

| Form | Example |
|------|---------|
| Logical key | `live/amazon/ABC12345/123/srch_01JEXAMPLE.json` |
| rclone path | `S:\a-search\live\amazon\ABC12345\123\srch_01JEXAMPLE.json` |
| S3 URI | `s3://my-a-search-results/live/amazon/ABC12345/123/srch_01JEXAMPLE.json` |

Sandbox swaps the first segment to `sandbox/â€¦` (separate tree â€” never mix).

Maintainer staging CSVs may land under
`{env}/_staging/{source}/{feedKey}/` on the same mount/bucket family.

## Ops checklist

1. Install rclone on the SQL host; remote points at `S3_RESULTS_BUCKET`.
2. Mount under `A_SEARCH_RCLONE_ROOT` (systemd/NSSM/Task Scheduler â€” site choice).
3. Confirm a known `searchId` file appears under
   `{root}\{env}\{source}\{userId}\{catalogId}\{searchId}.json` after a sandbox
   accept.
4. Agents: see `.grok/skills/a-search-endpoint/SKILL.md` (poll after HTTP 200).

## Related

- `docs/environments.md` â€” live/sandbox isolation
- `docs/endpoint-search.md` â€” accept contract
- `shared/resultsPath.js` â€” `resultsKey` / `resultsRclonePath` / `resultsS3Uri`
