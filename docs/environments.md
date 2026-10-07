# Environments: live and sandbox (LOCKED)

`a-search` has exactly two runtime environments: **live** and **sandbox**.
Every deployable surface (entry, each provider worker, maintainer) must know
which environment it is in and must not cross-write.

## Selection

| Mechanism | Rule |
|-----------|------|
| Request body `sandbox: true\|false` | Optional hint; default `false` → live |
| JWT claim (optional) | If present, `env` / `sandbox` claim may force sandbox; UNKNOWN until issuer confirms |
| Process env `A_SEARCH_ENV` | `live` \| `sandbox` on each Lambda/task — **authoritative for workers/maintainer** |
| Entry behaviour | Accepted job stamps `env` on SQS messages; workers refuse messages whose `env` ≠ process env |

## Isolation (must not leak)

| Resource | live | sandbox |
|----------|------|---------|
| SQS queues | `…-live-…` per source | `…-sandbox-…` per source |
| MSSQL | live Parts / feed-key tables (or live DB) | sandbox Parts / feed-key tables (or sandbox DB / schema) |
| Results path (rclone mount) | live mapped root | sandbox mapped root |
| Provider `.env` | live credentials / secrets | sandbox or shared-read-only test credentials |
| S3 bucket prefix or bucket | live | sandbox |

Sandbox may skip or soften external side effects (no production affiliate
writes, capped rate limits) but **must** still accept search with 200,
enqueue, and write results under the sandbox rclone path so callers can UAT.

## Results storage + rclone (LOCKED)

Object store remains an **S3 bucket**, but the **MSSQL host** exposes it as a
**mapped drive via rclone** on that same server. Search/result consumers and
ops tools on the SQL box read/write through the mount; AWS workers may still
use the S3 API with the same bucket/key layout.

**Ops mount guide:** [rclone-results.md](rclone-results.md) (`S3_RESULTS_BUCKET`,
`A_SEARCH_RCLONE_ROOT`, path examples).

Logical key (LOCKED — includes env prefix):

```
{env}/{source}/{userId}/{catalogId}/{searchId}.json
```

On the SQL server (examples — drive letters UNKNOWN until deploy):

```
live:     S:\a-search\live\{source}\{userId}\{catalogId}\{searchId}.json
sandbox:  S:\a-search\sandbox\{source}\{userId}\{catalogId}\{searchId}.json
```

Equivalent S3:

```
s3://{S3_RESULTS_BUCKET}/live/{source}/{userId}/{catalogId}/{searchId}.json
s3://{S3_RESULTS_BUCKET}/sandbox/{source}/{userId}/{catalogId}/{searchId}.json
```

(or separate buckets `…-live` / `…-sandbox` — choose one scheme in IaC;
prefix-under-one-bucket is the default LOCKED layout above).

Maintainer staging CSVs may also land under
`{env}/_staging/{source}/{feedKey}/` on the same mount/bucket family.

## Registry

`providers/registry.json` may include per-env enable overrides:

```json
{ "id": "amazon", "enabled": { "live": true, "sandbox": true } }
```

or flat `enabled: true` meaning both. Disabled for an env → not enqueued in
that env.
