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

## Installable mount runbook (FR-147)

Step-by-step for the SQL host after `cdk deploy` (stack output
`ResultsBucketName` / `S3_RESULTS_BUCKET`). Placeholders only - **never**
commit AWS access keys into git. Installing rclone/WinFsp from this repo's
CI is **out of scope**.

### Placeholders

| Placeholder | Meaning |
|-------------|---------|
| `<S3_RESULTS_BUCKET>` | Dedicated a-search results bucket (stack output `ResultsBucketName`) |
| `<rclone-remote>` | rclone remote name on the SQL host (example: `aws`) |
| Drive letter | LOCKED default **`X:`** (ops may remap; then use that letter everywhere below) |

### 1. Prerequisites

1. Prefer a **dedicated** results bucket (or `a-search/` prefix) - not the legacy `madeira-results-bucket` root.
2. On the SQL host: install **rclone** + **WinFsp** (or keep existing Madeira mount tooling).
3. AWS credentials for the remote live in the host rclone config / IAM role - not in this repository.

### 2. Configure the rclone remote

If an account-level remote already exists, reuse it. Otherwise create one
(ops machine; values out of band):

```text
rclone config
# New remote -> name <rclone-remote> -> Amazon S3 -> region of the results bucket
```

Verify the bucket is visible (no secrets in the command line beyond the remote name):

```text
rclone lsd <rclone-remote>:
rclone lsd <rclone-remote>:<S3_RESULTS_BUCKET>
```

Expect `live` and `sandbox` prefixes under the bucket after the first worker
writes (empty bucket before smoke is OK).

### 3. Mount at X: (or remapped letter)

Account-level remote: mount the **account root** so `X:` lists buckets, then
point `A_SEARCH_RCLONE_ROOT` at the **bucket folder**.

Example (interactive / service wrapper - adjust to the host's existing Madeira pattern):

```text
rclone mount <rclone-remote>: X: --vfs-cache-mode writes
```

Confirm:

```text
dir X:\
dir X:\<S3_RESULTS_BUCKET>
```

### 4. Set A_SEARCH_RCLONE_ROOT

Machine / service environment on the SQL host:

```text
A_SEARCH_RCLONE_ROOT=X:\<S3_RESULTS_BUCKET>
```

Live root: `%A_SEARCH_RCLONE_ROOT%\live\`  
Sandbox root: `%A_SEARCH_RCLONE_ROOT%\sandbox\`

### 5. Persist across reboot

Ensure rclone **starts after reboot** (Windows service, NSSM, or scheduled
task at startup). A plain interactive `rclone mount` process alone will not
survive logoff/reboot.

### 6. Verify path after smoke

After post-deploy smoke (`npm run smoke-deploy` / FR-144) or a sandbox
`POST /search` accept:

1. Note `searchId`, JWT `userId`, `catalogId`, source id, and `env` (`sandbox` recommended first).
2. Confirm the object under S3 and on the mount:

```text
dir %A_SEARCH_RCLONE_ROOT%\sandbox\<source>\<userId>\<catalogId>\
```

Expected file:

```text
{A_SEARCH_RCLONE_ROOT}\{env}\{source}\{userId}\{catalogId}\{searchId}.json
```

3. Agents: see `.grok/skills/a-search-endpoint/SKILL.md` (poll after HTTP 200).

### 7. Fail-closed checks

- `A_SEARCH_RCLONE_ROOT` includes the bucket folder (not bare `X:\`).
- Live and sandbox trees stay under separate first-segment prefixes.
- No AWS secret material in git, README samples, or scheduled-task command lines committed here.

## Ops checklist (summary)

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

- `docs/deploy.md` section 8 - install playbook pointer (FR-140 / FR-147)
- `docs/environments.md` - live/sandbox isolation; **Results storage + rclone (FR-124)**; **Network path (FR-122)**
- `docs/endpoint-search.md` - accept contract
- `shared/resultsPath.js` - `resultsKey` / `resultsRclonePath` / `resultsS3Uri`
