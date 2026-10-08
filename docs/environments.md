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
| MSSQL | `madeiradb` on `WIN-MPRE8VI4U6U` (see below) | UNKNOWN (no separate sandbox DB/schema yet) |
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


## MSSQL target (FR-119)

**Live** (verified 2026-10-08):

| Knob | Value |
|------|-------|
| Host | `WIN-MPRE8VI4U6U` (IONOS Windows; SQL Server 2022 Standard; mixed-mode auth; TCP on all interfaces) |
| Database | `madeiradb` — the **only** user database on the instance |
| Auth on the box | Windows integrated (`sqlcmd -E`) works locally |
| Auth from AWS | SQL login or domain account over NTLM, read from a secret store. A Lambda outside the domain cannot use integrated auth. |
| Recovery | SIMPLE. Nightly full backup only (`Madeira_Nightly_Maintenance` at 02:00). Point-in-time restore is not possible. |

There is no RDS endpoint in this repo and nothing to "switch off RDS" — the
target was undefined until FR-119. Repo placeholders must not invent a
non-existent database name.

**Sandbox** (`A_SEARCH_ENV=sandbox`): **UNKNOWN** until Simon decides among:

1. a separate database on the same instance,
2. a schema inside `madeiradb`, or
3. sandbox reads live read-only.

Today there is **no** `a_search_sandbox` database and no sandbox schema.
`Env` (`live` / `sandbox`) exists only in a-search's own DDL (`CK_Parts_Env`,
etc.). No madeiradb business table has an env column.

**Network path (AWS Lambda/Fargate → IONOS):** **UNKNOWN** until ops confirm
fixed egress IP / firewall allowlist / VPN.

**Least-privilege login (spec):** the SQL login used by a-search workers and
maintainer SHOULD have **SELECT** on the tables a-search reads (for example
`dbo.Parts` and feed-key / pending-onboard tables named in provider docs).
No write rights on madeiradb business tables unless a later FR grants them.
Any a-search writer must treat SIMPLE recovery + nightly-only backup as a
data-loss limit (no PITR). Credentials stay in the deploy secret store —
never in git.

**Env keys** (see `.env.example` files — placeholders only, never credentials):

| Key | Meaning |
|-----|---------|
| `MSSQL_SERVER` | Placeholder `<ionos-sql-host>`; deploy maps to `WIN-MPRE8VI4U6U` or a DNS alias |
| `MSSQL_DATABASE` | `madeiradb` |
| `MSSQL_USER` / `MSSQL_PASSWORD` | SQL login when not using trusted connection |
| `MSSQL_TRUSTED_CONNECTION` | `true` for integrated / NTLM (on-box or domain) |
| `MSSQL_DOMAIN` | optional NTLM domain |
| `MSSQL_ENCRYPT` | default `true` (read by `mssqlConfigFromEnv`) |
| `MSSQL_TRUST_SERVER_CERTIFICATE` | default `true` on lab boxes |

Local selftest probes (`providers/local/*/src/selftestProbe.js`) report
`mssql_unreachable` or `mssql_auth_failed` when Parts connect fails and feed
fallback is not available (`shared/mssql/classifyConnectError.js`).

## Registry

`providers/registry.json` may include per-env enable overrides:

```json
{ "id": "amazon", "enabled": { "live": true, "sandbox": true } }
```

or flat `enabled: true` meaning both. Disabled for an env → not enqueued in
that env.

## Queue URL env vars (FR-034)

Registry `queueEnv` is a **logical** name such as `SQS_AMAZON_URL`. Entry and
workers resolve it with `providers/resolveQueueUrl.js`:

1. Prefer `SQS_<SOURCE>_LIVE_URL` / `SQS_<SOURCE>_SANDBOX_URL` for the request
   `env` (matches CDK entry environment keys).
2. Fall back to `SQS_<SOURCE>_URL` only for a single-env deploy.
3. If neither is set → **error** (`missing_queue_url`) — never silent noop enqueue.

CDK (`cdk/lib/a-search-stack.js`) already injects `SQS_AMAZON_LIVE_URL` and
`SQS_AMAZON_SANDBOX_URL` into the entry Lambda. Document additional sources the
same way when their queues are added.

## SQS pacing (407 / 429)

Consumers must stay slow enough that provider APIs do not rate-block the
fleet. See **[sqs-pacing.md](sqs-pacing.md)** (`batchSize: 1`, concurrency
caps, fail-when 407/429).
