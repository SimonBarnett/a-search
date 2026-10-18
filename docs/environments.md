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
| MSSQL | `a_search` on **walrus** (see below; FR-3948) | **Separate database** on the same instance (FR-121 LOCKED; name via deploy `MSSQL_DATABASE`) |
| Results path (rclone mount) | live mapped root | sandbox mapped root |
| Provider `.env` | live credentials / secrets | sandbox or shared-read-only test credentials |
| S3 bucket prefix or bucket | live | sandbox |

Sandbox may skip or soften external side effects (no production affiliate
writes, capped rate limits) but **must** still accept search with 200,
enqueue, and write results under the sandbox rclone path so callers can UAT.

## Results storage + rclone (LOCKED -- FR-124 / FR-3948)

Object store remains an **S3 bucket**, exposed on **walrus** (the MSSQL host)
as a **mapped drive via rclone**. **Direction (FR-3948):** walrus **writes**
DB-backed search results onto the mount; AWS serves from S3 and does **not**
connect to MSSQL. Live marketplace providers that stay in AWS may still
`PutObject` via the S3 API into the dedicated results bucket.

**DB-backed landing path (FR-3948 LOCKED):** bucket `a-clubs`, key layout
`a-clubs/{host}/{guid}/IN/` (each host is a **top-level** folder; **no**
`HOSTS/` prefix). Simon 2026-10-18 cutover. Sibling FRs wire the runner.

**Ops mount guide:** [rclone-results.md](rclone-results.md) (`S3_RESULTS_BUCKET`,
`A_SEARCH_RCLONE_ROOT`, `a-clubs` IN path, path examples).

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
| Host | **`walrus`** (on-prem Windows; SQL Server; outbound HTTPS only --- **no inbound ports**, FR-3948 / FR-122 **C**). Historical lab hostname `WIN-MPRE8VI4U6U` (IONOS) is **superseded**. |
| Database | `a_search` (live) and `a_search_sandbox` (sandbox) on this instance (FR-251 / FR-121). madeiradb is read-only via `mdb.*`. |
| Auth on the box | Windows integrated (`sqlcmd -E`) works locally |
| Auth from AWS | **None for the new stack (FR-3948).** AWS Lambdas do not connect to MSSQL. Legacy FR-137/FR-149 Lambda SQL path is superseded by on-box (walrus) runners. |
| Recovery | SIMPLE. Nightly full backup only (`Madeira_Nightly_Maintenance` at 02:00) covers **`madeiradb`**. Point-in-time restore is not possible. |

There is no RDS endpoint in this repo and nothing to "switch off RDS" -- the
live target was undefined until FR-119. Repo placeholders must not invent
credentials or treat a not-yet-created sandbox DB name as already live.

**Sandbox** (`A_SEARCH_ENV=sandbox`): **LOCKED (FR-121)** -- **separate database
on the same instance** (`walrus`; historical `WIN-MPRE8VI4U6U` superseded).

| Rule | Detail |
|------|--------|
| Chosen option | **(1) separate database on the same instance** |
| Live DB | `a_search` (FR-251) |
| Sandbox DB | Separate user database on the same SQL Server; **name** is set at deploy via `MSSQL_DATABASE`. **Required** name (FR-251 / FR-146): `a_search_sandbox` (operator may override). Treat as missing until ops follows [sql/apply-ddl-runbook.md](sql/apply-ddl-runbook.md) -- do not invent credentials. |
| Rejected | **(2)** schema inside `madeiradb`; **(3)** sandbox reads live read-only |
| Ops | Create the sandbox DB with **`RECOVERY SIMPLE`** (instance `model` is FULL -- default would grow the log). Apply `maintainer/sql` DDL to **both** live and sandbox DBs per [sql/apply-ddl-runbook.md](sql/apply-ddl-runbook.md) (FR-146). Extend nightly backup/stats jobs for the sandbox DB, or document it as rebuildable with no backup. |
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
| `MSSQL_SERVER` | Placeholder `<ionos-sql-host>` / `<walrus-sql-host>`; on-box maps to **walrus** (historical `WIN-MPRE8VI4U6U` superseded) |
| `MSSQL_DATABASE` | Live: `a_search`. Sandbox: `a_search_sandbox` (FR-251). Never `madeiradb` for writers. |
| `MSSQL_USER` / `MSSQL_PASSWORD` | SQL login when not using trusted connection |
| `MSSQL_TRUSTED_CONNECTION` | `true` for integrated / NTLM (on-box or domain) |
| `MSSQL_DOMAIN` | optional NTLM domain |
| `MSSQL_ENCRYPT` | default `true` (read by `mssqlConfigFromEnv`) |
| `MSSQL_TRUST_SERVER_CERTIFICATE` | default `true` on lab boxes |

### CDK Secrets Manager (FR-137) --- legacy; superseded for new stack (FR-3948)

**New stack (FR-3948):** do **not** pass `-c mssqlSecretArn` / `-c mssqlAppSecretArn`
and do **not** wire `MSSQL_*` onto Lambdas. DB-backed work runs on **walrus**
(on-box). Sibling CDK FRs strip `wireMssqlSecretEnv` from the template.

**Legacy (pre-cutover) docs retained for pins / old stacks:**
`cdk/lib/a-search-stack.js` still documents `wireMssqlSecretEnv` for
maintainer / local workers / awin/impact onboarding via Secrets Manager -
never plaintext passwords in git or synth snapshots.

| Deploy context | Meaning |
|----------------|---------|
| `-c mssqlSecretArn=arn:aws:secretsmanager:...` | **Legacy only.** Existing secret ARN (old stacks; synth placeholder `000000000000`). **Omit for the new stack (FR-3948).** |
| `-c mssqlLiveDatabase=a_search` | Optional; live default **`a_search`** (FR-251). Do **not** use `madeiradb` for writers. |
| `-c mssqlSandboxDatabase=<name>` | Optional; default `a_search_sandbox` (FR-251 / FR-121) |
| `-c mssqlAppSecretArn=...` | Legacy preferred app secret ARN (FR-251); legacy `-c mssqlSecretArn` still accepted on old stacks |

Secret **string JSON** keys (create in AWS / ops; never commit values):

| JSON key | Lambda env |
|----------|------------|
| `SERVER` | `MSSQL_SERVER` |
| `USER` | `MSSQL_USER` |
| `PASSWORD` | `MSSQL_PASSWORD` |
| (optional) `TRUSTED_CONNECTION` / `DOMAIN` | wire later if needed; stack sets `MSSQL_ENCRYPT=true` and `MSSQL_TRUST_SERVER_CERTIFICATE=true` as plain defaults |

`MSSQL_DATABASE` is **plain** env (not from the secret) so live vs sandbox can
point at different DB names on the same instance. Live default is **`a_search`**
(FR-251); never `madeiradb` for writers. Live amazon/ebay/... workers do **not**
receive MSSQL env. Helper (legacy): `wireMssqlSecretEnv` + `grantRead`.

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

AWS Lambda/Fargate must **not** open SQL to the on-prem host. This section is
the **decision surface** (LOCKED options) plus the **Chosen option**.

| Option id | Name | Meaning |
|-----------|------|---------|
| A | Fixed egress allowlist | AWS NAT / static egress IPs allowed through the host or edge firewall to SQL TCP (usually 1433). Ops owns the allowlist outside this repo. **Rejected for the new stack (FR-3948).** |
| B | VPN | Site-to-site or client VPN so workers land on a path that can reach the SQL host. Tunnel config lives in ops/IaC secrets, never in product git. **Rejected for the new stack (FR-3948).** |
| C | On-box only | No off-box SQL from AWS. Workers that need MSSQL run on the SQL host (**walrus**). Lambda stays S3/SQS-only for those paths. Host makes **outbound HTTPS only** (no inbound ports). |

**Chosen option:** **LOCKED C** (on-box / **walrus** only) --- Simon 2026-10-18
cutover (FR-3948 / umbrella #3944). Options A and B are documented for history
and are **not** the install path. Do not invent host firewall rules, private
IPs, or VPN secrets as code in git. Historical lab hostname `WIN-MPRE8VI4U6U`
is superseded by **walrus**.

**Installable pattern (FR-149 / FR-3948):** CDK stays **explicit no-VPC**
(default Lambda egress; no NAT/SG in `ASearchStack`). FR-149 fixed-egress
allowlist steps for MSSQL are **superseded** --- do **not** open SQL TCP/1433
to AWS egress for the new stack. See [deploy.md](deploy.md) section 9.

**Ops checklist** (FR-122 **LOCKED C**; no inbound ports on walrus):

1. Chosen option is **LOCKED C** (this section). Do not re-open A/B without a new FR.
2. Run DB-backed workers / maintainer / onboarding / shop-sync on **walrus**
   (outbound SQS long-poll + S3/rclone write). Keep AWS Lambdas off direct SQL.
3. Confirm name resolution for `MSSQL_SERVER` / **walrus** on the box only
   (historical `WIN-MPRE8VI4U6U` superseded).
4. Confirm least-privilege SQL login (see **MSSQL target** above) from the
   on-box path; madeiradb stays read-only (FR-251).
5. Smoke: on-box selftest shows `ok` or a classified error -- never a hang.
6. **Never** commit firewall rule dumps, private IPs, VPN PSKs, or SQL
   passwords into git. Placeholders stay in `.env.example` only.

Related: [rclone-results.md](rclone-results.md) (walrus mount + `a-clubs` IN),
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
