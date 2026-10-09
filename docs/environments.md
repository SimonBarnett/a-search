# Environments: live and sandbox (LOCKED)

`a-search` has exactly two runtime environments: **live** and **sandbox**.
Every deployable surface (entry, each provider worker, maintainer) must know
which environment it is in and must not cross-write.

## Selection

| Mechanism | Rule |
|-----------|------|
| Request body `sandbox: true\|false` | Optional hint; default `false` -> live |
| JWT claim (optional) | If present, `env` / `sandbox` claim may force sandbox; UNKNOWN until issuer confirms |
| Process env `A_SEARCH_ENV` | `live` \| `sandbox` on each Lambda/task -- **authoritative for workers/maintainer** (entry omits this; FR-148) |
| Entry behaviour (FR-148) | Entry CDK **omits** `A_SEARCH_ENV` (env-agnostic accept). Accept stamps `env` on SQS from body `sandbox` (default live). Workers refuse messages whose `env` != their process env |

## Isolation (must not leak)

| Resource | live | sandbox |
|----------|------|---------|
| SQS queues | `...-live-...` per source | `...-sandbox-...` per source |
| MSSQL | `madeiradb` on `WIN-MPRE8VI4U6U` (see below) | **Separate database** on the same instance (FR-121 LOCKED; name via deploy `MSSQL_DATABASE`) |
| Results path (rclone mount) | live mapped root | sandbox mapped root |
| Provider `.env` | live credentials / secrets | sandbox or shared-read-only test credentials |
| S3 bucket prefix or bucket | live | sandbox |

Sandbox may skip or soften external side effects (no production affiliate
writes, capped rate limits) but **must** still accept search with 200,
enqueue, and write results under the sandbox rclone path so callers can UAT.

## Results storage + rclone (LOCKED -- FR-124)

Object store remains an **S3 bucket**, but the **MSSQL host** exposes it as a
**mapped drive via rclone** on that same server. Search/result consumers and
ops tools on the SQL box read/write through the mount; AWS workers may still
use the S3 API with the same bucket/key layout.

**Ops mount guide:** [rclone-results.md](rclone-results.md) (`S3_RESULTS_BUCKET`,
`A_SEARCH_RCLONE_ROOT`, path examples).

### FR-124 LOCKED defaults (verified 2026-10-09)

| Knob | LOCKED default |
|------|----------------|
| Drive letter | **`X:`** on the SQL host (**ops may remap**) |
| `A_SEARCH_RCLONE_ROOT` | `X:\<S3_RESULTS_BUCKET>` (bucket folder under the account-level mount) |
| Bucket scheme | **One dedicated results bucket** with `live/` + `sandbox/` key prefixes |
| Rejected as default | Two buckets (`...-live` / `...-sandbox`); reusing legacy `madeira-results-bucket` root (no env prefix) |

Logical key (LOCKED -- includes env prefix):

```
{env}/{source}/{userId}/{catalogId}/{searchId}.json
```

On the SQL server (LOCKED example letter `X:`):

```
live:     X:\<S3_RESULTS_BUCKET>\live\{source}\{userId}\{catalogId}\{searchId}.json
sandbox:  X:\<S3_RESULTS_BUCKET>\sandbox\{source}\{userId}\{catalogId}\{searchId}.json
```

Equivalent S3 (prefix-under-one-bucket):

```
s3://{S3_RESULTS_BUCKET}/live/{source}/{userId}/{catalogId}/{searchId}.json
s3://{S3_RESULTS_BUCKET}/sandbox/{source}/{userId}/{catalogId}/{searchId}.json
```

Maintainer staging CSVs may also land under
`{env}/_staging/{source}/{feedKey}/` on the same mount/bucket family.


## MSSQL target (FR-119)

**Live** (verified 2026-10-08):

| Knob | Value |
|------|-------|
| Host | `WIN-MPRE8VI4U6U` (IONOS Windows; SQL Server 2022 Standard; mixed-mode auth; TCP on all interfaces) |
| Database | `madeiradb` (live). Sandbox uses a **separate** database on this instance (FR-121). |
| Auth on the box | Windows integrated (`sqlcmd -E`) works locally |
| Auth from AWS | SQL login or domain account over NTLM, read from a secret store. A Lambda outside the domain cannot use integrated auth. |
| Recovery | SIMPLE. Nightly full backup only (`Madeira_Nightly_Maintenance` at 02:00) covers **`madeiradb`**. Point-in-time restore is not possible. |

There is no RDS endpoint in this repo and nothing to "switch off RDS" -- the
live target was undefined until FR-119. Repo placeholders must not invent
credentials or treat a not-yet-created sandbox DB name as already live.

**Sandbox** (`A_SEARCH_ENV=sandbox`): **LOCKED (FR-121)** -- **separate database
on the same instance** (`WIN-MPRE8VI4U6U`).

| Rule | Detail |
|------|--------|
| Chosen option | **(1) separate database on the same instance** |
| Live DB | `madeiradb` |
| Sandbox DB | Separate user database on the same SQL Server; **name** is set at deploy via `MSSQL_DATABASE` (placeholder `<sandbox-mssql-database>`). There is **no** `a_search_sandbox` name committed as real -- do not invent credentials or treat a missing DB as already created. |
| Rejected | **(2)** schema inside `madeiradb`; **(3)** sandbox reads live read-only |
| Ops (OOS for this FR) | Create the sandbox DB with **`RECOVERY SIMPLE`** (instance `model` is FULL -- default would grow the log). Apply `maintainer/sql` DDL to **both** live and sandbox DBs. Extend nightly backup/stats jobs for the sandbox DB, or document it as rebuildable with no backup. |
| Fail-closed | Sandbox workers/maintainer must point `MSSQL_DATABASE` at the sandbox DB -- never write sandbox traffic into `madeiradb`. Rows in a-search DDL still use `Env='sandbox'` inside that DB (`CK_*_Env`). |

**Least-privilege login (spec):** the SQL login used by a-search workers and
maintainer SHOULD have **SELECT** on the tables a-search reads (for example
`dbo.Parts` and feed-key / pending-onboard tables named in provider docs).
No write rights on madeiradb business tables unless a later FR grants them.
Any a-search writer must treat SIMPLE recovery + nightly-only backup as a
data-loss limit (no PITR). Credentials stay in the deploy secret store --
never in git.

**Env keys** (see `.env.example` files -- placeholders only, never credentials):

| Key | Meaning |
|-----|---------|
| `MSSQL_SERVER` | Placeholder `<ionos-sql-host>`; deploy maps to `WIN-MPRE8VI4U6U` or a DNS alias |
| `MSSQL_DATABASE` | Live examples use `madeiradb`. Sandbox deploys set this to the separate sandbox DB name (`<sandbox-mssql-database>`) |
| `MSSQL_USER` / `MSSQL_PASSWORD` | SQL login when not using trusted connection |
| `MSSQL_TRUSTED_CONNECTION` | `true` for integrated / NTLM (on-box or domain) |
| `MSSQL_DOMAIN` | optional NTLM domain |
| `MSSQL_ENCRYPT` | default `true` (read by `mssqlConfigFromEnv`) |
| `MSSQL_TRUST_SERVER_CERTIFICATE` | default `true` on lab boxes |

### CDK Secrets Manager (FR-137)

`cdk/lib/a-search-stack.js` wires `MSSQL_*` onto **maintainer**, **local**
provider workers (`providers/local/*`), and **awin/impact onboarding** Lambdas
via Secrets Manager - never plaintext passwords in git or synth snapshots.

| Deploy context | Meaning |
|----------------|---------|
| `-c mssqlSecretArn=arn:aws:secretsmanager:...` | Existing secret ARN (required for real deploy; synth uses a `000000000000` placeholder ARN) |
| `-c mssqlLiveDatabase=madeiradb` | Optional; default `madeiradb` |
| `-c mssqlSandboxDatabase=<name>` | Optional; default `<sandbox-mssql-database>` (FR-121 placeholder) |

Secret **string JSON** keys (create in AWS / ops; never commit values):

| JSON key | Lambda env |
|----------|------------|
| `SERVER` | `MSSQL_SERVER` |
| `USER` | `MSSQL_USER` |
| `PASSWORD` | `MSSQL_PASSWORD` |
| (optional) `TRUSTED_CONNECTION` / `DOMAIN` | wire later if needed; stack sets `MSSQL_ENCRYPT=true` and `MSSQL_TRUST_SERVER_CERTIFICATE=true` as plain defaults |

`MSSQL_DATABASE` is **plain** env (not from the secret) so live vs sandbox can
point at different DB names on the same instance. Live amazon/ebay/... workers
do **not** receive MSSQL env (no SQL). Helper: `wireMssqlSecretEnv` +
`grantRead` on the secret.

Local selftest probes (`providers/local/*/src/selftestProbe.js`) report
`mssql_unreachable` or `mssql_auth_failed` when Parts connect fails and feed
fallback is not available (`shared/mssql/classifyConnectError.js`).

### CDK Secrets Manager - provider credentials (FR-138)

Enabled provider workers (amazon, ebay, rakuten, cj, awin, impact) and
awin/impact onboarding receive marketplace credential env from **per-source**
Secrets Manager JSON secrets. Stay-dark providers are omitted (no grant).

| Deploy context | Meaning |
|----------------|---------|
| `-c amazonProviderSecretArn=arn:...` | Override ARN for amazon (same pattern: `ebayProviderSecretArn`, ...) |
| (omit) | Synth uses `000000000000` placeholder `a-search/provider/<id>-AbCdEf` |

JSON keys match that provider's `.env.example` credential names (e.g.
`AMAZON_ACCESS_KEY`, `EBAY_CLIENT_SECRET`, `AWIN_API_TOKEN`). See
[secrets-matrix.md](secrets-matrix.md). Helper: `wireProviderSecretEnv`.

## Network path (FR-122)

AWS Lambda/Fargate (and other off-box workers) reach `WIN-MPRE8VI4U6U` /
`madeiradb` only through an ops-chosen path. This section is the **decision
surface** (LOCKED options). The **Chosen option** stays **PENDING** until
ops confirms one; do not invent host firewall rules, private IPs, or VPN
secrets as code in git.

| Option id | Name | Meaning |
|-----------|------|---------|
| A | Fixed egress allowlist | AWS NAT / static egress IPs allowed through the IONOS host or edge firewall to SQL TCP (usually 1433). Ops owns the allowlist outside this repo. |
| B | VPN | Site-to-site or client VPN so workers land on a path that can reach the SQL host. Tunnel config lives in ops/IaC secrets, never in product git. |
| C | On-box only | No off-box SQL from AWS. Workers that need MSSQL run on the SQL host (or a peered box already allowed). Lambda stays S3/SQS-only for those paths. |

**Chosen option:** **PENDING** (still UNKNOWN which of A/B/C ops will lock).
Until then, treat off-box MSSQL connects as may-fail: local selftest probes
map connect failures to `mssql_unreachable` / `mssql_auth_failed`
(`shared/mssql/classifyConnectError.js`).

**Ops checklist** (no ports opened by this FR):

1. Pick exactly one of A / B / C and record it here as LOCKED (replace PENDING).
2. If A: publish the egress CIDR/IP set in the ops runbook; open SQL TCP only
   for that set on the IONOS edge/host firewall.
3. If B: stand up the VPN; confirm name resolution for
   `MSSQL_SERVER` / `WIN-MPRE8VI4U6U` from the worker side.
4. If C: document which processes on the box run MSSQL readers; keep AWS
   workers off direct SQL.
5. Confirm least-privilege SQL login (see **MSSQL target** above) from the
   chosen path.
6. Smoke: sandbox selftest shows `ok` or a classified error -- never a hang.
7. **Never** commit firewall rule dumps, private IPs, VPN PSKs, or SQL
   passwords into git. Placeholders stay in `.env.example` only.

Related: [rclone-results.md](rclone-results.md) (SQL-host mount),
[endpoint-selftest.md](endpoint-selftest.md) (`mssql_unreachable`).

## Registry

`providers/registry.json` may include per-env enable overrides:

```json
{ "id": "amazon", "enabled": { "live": true, "sandbox": true } }
```

or flat `enabled: true` meaning both. Disabled for an env -> not enqueued in
that env.

## Queue URL env vars (FR-034)

Registry `queueEnv` is a **logical** name such as `SQS_AMAZON_URL`. Entry and
workers resolve it with `providers/resolveQueueUrl.js`:

1. Prefer `SQS_<SOURCE>_LIVE_URL` / `SQS_<SOURCE>_SANDBOX_URL` for the request
   `env` (matches CDK entry environment keys).
2. Fall back to `SQS_<SOURCE>_URL` only for a single-env deploy.
3. If neither is set -> **error** (`missing_queue_url`) -- never silent noop enqueue.

CDK (`cdk/lib/a-search-stack.js`) already injects `SQS_AMAZON_LIVE_URL` and
`SQS_AMAZON_SANDBOX_URL` into the entry Lambda. Document additional sources the
same way when their queues are added.

## SQS pacing (407 / 429)

Consumers must stay slow enough that provider APIs do not rate-block the
fleet. See **[sqs-pacing.md](sqs-pacing.md)** (`batchSize: 1`, concurrency
caps, fail-when 407/429).
