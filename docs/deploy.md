# Deploy a-search (installable playbook)

Operator playbook to bring up **ASearchStack** on AWS for the already-enabled
registry sources (amazon, ebay, rakuten, cj, awin, impact). **Never put secret
values in this file, in git, or in synth snapshots.**

Cross-links: [cdk/README.md](../cdk/README.md) - [environments.md](environments.md) -
[rclone-results.md](rclone-results.md) - [release-installable.md](release-installable.md) -
[secrets-matrix.md](secrets-matrix.md) (when present; FR-138/FR-150).

## 1. Prerequisites

| Need | Notes |
|------|--------|
| Node >= 20 | `package.json` engines |
| Repo checkout | `npm ci` or `npm install` at repo root |
| AWS CLI / CDK credentials | Account + region for deploy (SSO, env keys, or instance role) |
| `npm run synth` exit 0 | Local gate before deploy |
| Secrets Manager secrets | JWT, MSSQL, per-provider JSON - create in AWS first (placeholders only in git) |

```bash
npm ci
npm run synth
```

## 2. AWS auth

Confirm the caller can deploy CloudFormation in the target account/region:

```bash
aws sts get-caller-identity
aws configure get region
# or: export AWS_PROFILE=... AWS_REGION=eu-west-2
```

Do not paste access keys into docs, tickets, or chat.

## 3. CDK bootstrap (once per account/region)

```bash
npx cdk bootstrap aws://ACCOUNT_ID/REGION --app "node cdk/bin/a-search.js"
```

Skip if the account/region is already bootstrapped for CDK v2.

## 4. Fill secrets (ops - values stay in AWS)

Create or reuse Secrets Manager secrets. JSON **key names** only below - never
real passwords, tokens, or JWTs in git.

### Entry JWT (FR-136 / FR-123)

Prefer an existing secret complete ARN:

```bash
npx cdk deploy --app "node cdk/bin/a-search.js" ASearchStack \
  -c jwtSecretArn=arn:aws:secretsmanager:REGION:ACCOUNT:secret:name-XXXXXX
```

Secret JSON string fields:

| Key | Notes |
|-----|--------|
| `JWT_ISSUER` | Required at runtime |
| `JWT_AUDIENCE` | Required at runtime |
| `JWT_JWKS_URL` | Prefer for production (asymmetric) |
| `JWT_SECRET` | HS256 lab/fixtures; optional if JWKS set |
| `JWT_HS256_SECRET` | Optional alias - entry also accepts this name |

When `jwtSecretArn` is omitted, the stack creates `EntryJwtSecret`; output
`EntryJwtSecretArn` prints the ARN. Populate that secret, then continue.

Entry receives `secretsmanager:GetSecretValue` on that secret only (`grantRead`) -
never `Resource *` for secrets.

Detail: [endpoint-search.md](endpoint-search.md) **JWT deploy config (FR-123)**.

### MSSQL (FR-137)

```bash
  -c mssqlSecretArn=arn:aws:secretsmanager:REGION:ACCOUNT:secret:name-XXXXXX \
  -c mssqlSandboxDatabase=YOUR_SANDBOX_DB
```

Secret JSON keys: `SERVER`, `USER`, `PASSWORD`. `MSSQL_DATABASE` is plain CDK
context (live default `madeiradb`). Targets: maintainer, local workers, awin/impact
onboarding - not live marketplace workers. See [environments.md](environments.md).

### Provider credentials (FR-138)

Per-source secrets for enabled ids only (amazon, ebay, rakuten, cj, awin, impact).
Context pattern: `-c amazonProviderSecretArn=...` (same for each id). JSON keys
match that provider's `.env.example` credential names. Stay-dark sources get no
grants until an enable-provider FR. See [secrets-matrix.md](secrets-matrix.md)
when present; otherwise [cdk/README.md](../cdk/README.md).

## 5. cdk deploy

Prefer the FR-141 wrapper (requires account context; never commit account IDs):

```bash
npm run deploy -- -c account=ACCOUNT_ID -c region=eu-west-2
```

`npm run deploy` sets `-c requireDeployEnv=true` so a missing account exits with
`FR-141: missing deploy account...`. Aliases: `deployAccount` / `deployRegion`.
Fallback env: `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION`.

Or call CDK directly from repo root (after secrets ARNs are ready):

```bash
npx cdk deploy --app "node cdk/bin/a-search.js" ASearchStack \
  -c jwtSecretArn=arn:aws:secretsmanager:... \
  -c mssqlSecretArn=arn:aws:secretsmanager:... \
  -c mssqlSandboxDatabase=YOUR_SANDBOX_DB \
  -c amazonProviderSecretArn=arn:... \
  -c ebayProviderSecretArn=arn:... \
  -c rakutenProviderSecretArn=arn:... \
  -c cjProviderSecretArn=arn:... \
  -c awinProviderSecretArn=arn:... \
  -c impactProviderSecretArn=arn:...
```

Approve IAM/security-group changes when the CLI prompts. Stay-dark Phase-2
providers remain disabled in the registry - this playbook does not enable them.

### Cost tags (FR-155)

All taggable stack resources get cost allocation tags:

| Tag | Value |
|-----|--------|
| `Project` | `a-search` (fixed) |
| `Env` | from `-c stage=` (preferred), else `-c env=` / `-c costEnv=`; default `default` when unset |

```bash
  -c stage=prod
```

Use the same `stage` key FR-156 will use for name suffixes. AWS Organizations tag
policies are out of scope.

## 6. Read stack outputs

After deploy succeeds, note at least:

| Output | Use |
|--------|-----|
| **SearchApiUrl** | HTTP API base - `POST {url}/search`, `GET\|POST {url}/selftest` |
| `ResultsBucketName` | Pass to rclone / `S3_RESULTS_BUCKET` |
| `EntryJwtSecretArn` / `MssqlSecretArn` / `*ProviderSecretArn` | Confirm secret wiring |

```bash
# Example: print SearchApiUrl from CloudFormation stack outputs
aws cloudformation describe-stacks --stack-name ASearchStack \
  --query "Stacks[0].Outputs[?OutputKey=='SearchApiUrl'].OutputValue" \
  --output text
```

## 7. Smoke (FR-144)

With a **fixture** JWT issued for the configured issuer/audience (never a
production user token in git):

```bash
export A_SEARCH_API_URL="<SearchApiUrl>"
export A_SEARCH_SMOKE_JWT="<fixture jwt>"
npm run smoke-deploy
# or: node scripts/smoke-deploy.js --url "$A_SEARCH_API_URL" --jwt "$A_SEARCH_SMOKE_JWT"
```

The script asserts:

1. `POST {SearchApiUrl}/search` with `Authorization: Bearer <fixture>` -> **HTTP 200** + `accepted: true` + `searchId`
2. `GET {SearchApiUrl}/selftest?sandbox=true` -> **HTTP 200** + selftest JSON shape (`ok`, `providers[].id`/`ok`) per [endpoint-selftest.md](endpoint-selftest.md). Provider probe failures are reported in the table and are **not** fatal (no live provider credentials required for the accept/shape path).

Optional manual follow-up: confirm a results object appears under `{env}/{source}/...` in S3 (and on the rclone mount after step 8).

Do **not** wire this against production from CI without an explicit approval gate.

## 8. Point rclone (SQL host)

On the MSSQL host, mount the results bucket and set
`A_SEARCH_RCLONE_ROOT` to the bucket folder (LOCKED example letter **`X:`** -
ops may remap).

Step-by-step installable mount runbook (remote, mount, live/sandbox roots,
verify path, reboot persistence): [rclone-results.md](rclone-results.md)
**Installable mount runbook (FR-147)**. FR-124 scheme locks stay in that doc.

Workers already have `S3_RESULTS_BUCKET` + IAM from the stack (FR-130).

## Synth check (no deploy)

```bash
npm run synth
```

Template must show Secrets Manager dynamic references for JWT_* / MSSQL_* /
provider credentials - never a real password, API token, or JWT string.

## 9. MSSQL network path - no-VPC + fixed egress (FR-149)

`ASearchStack` is **explicit no-VPC**: Lambdas use default AWS networking.
There are no `ec2.Vpc`, NAT gateway, or Security Group constructs in this
product stack. Cross-link: [environments.md](environments.md) **Network path
(FR-122)** (options A / B / C; Chosen may stay PENDING).

**When ops selects FR-122 option A (fixed egress allowlist)** - the installable
path for off-box MSSQL from AWS workers/maintainer/onboarding:

1. Confirm which Lambdas need MSSQL (maintainer, local/onboarding workers with
   `MSSQL_*` - not live marketplace amazon/ebay workers that stay SQL-free).
2. In the deploy account/region, identify the **egress IP set** AWS will present
   to the public internet (typically NAT Gateway Elastic IPs if you later add a
   VPC, or the documented regional Lambda egress behaviour for default
   networking). Record that set in the **ops** runbook only - **never** commit
   real CIDRs or private IPs into this repo.
3. On the IONOS edge or `WIN-MPRE8VI4U6U` host firewall, allow **SQL TCP**
   (usually **1433**) from that egress set only (least privilege). Opening the
   firewall is **ops** - out of scope for this repo (FR-149 / FR-122).
4. Confirm `MSSQL_SERVER` / Secrets Manager MSSQL secret resolve from a worker
   and sandbox selftest returns `ok` or a classified `mssql_*` error (never a
   hang). See [endpoint-selftest.md](endpoint-selftest.md).
5. If ops instead locks **B (VPN)** or **C (on-box only)**, follow the FR-122
   checklist in environments.md; do not invent VPC/VPN IaC in product git under
   this FR.

**Rejected for v0.1 installable:** shipping VPC/NAT/SG CDK without an ops-locked
FR-122 Chosen option.

## Out of scope for this playbook

- Production deploy from a PR / CI approval gate (separate FR)
- CI auto-smoke against production without approval
- Enabling stay-dark providers
- Creating sandbox DB DDL on IONOS - ops follow [sql/apply-ddl-runbook.md](sql/apply-ddl-runbook.md) (FR-146); agents do not execute DDL
- Opening IONOS firewall ports (ops; FR-149 / FR-122)
