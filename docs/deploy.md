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

From repo root (after secrets ARNs are ready):

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

## 7. Smoke (manual until FR-144 script)

With a **fixture** JWT issued for the configured issuer/audience (never a
production user token in git):

1. `POST {SearchApiUrl}/search` with `Authorization: Bearer <fixture>` -> **HTTP 200** accept (fan-out async).
2. `GET` or `POST {SearchApiUrl}/selftest` -> shape per [endpoint-selftest.md](endpoint-selftest.md).
3. Confirm a results object appears under `{env}/{source}/...` in S3 (and on the rclone mount after step 8).

Automated post-deploy smoke script is **FR-144** (out of scope here).

## 8. Point rclone (SQL host)

On the MSSQL host, mount the results bucket and set
`A_SEARCH_RCLONE_ROOT` to the bucket folder (LOCKED example letter **`X:`** -
ops may remap). Full procedure: [rclone-results.md](rclone-results.md).

Workers already have `S3_RESULTS_BUCKET` + IAM from the stack (FR-130).

## Synth check (no deploy)

```bash
npm run synth
```

Template must show Secrets Manager dynamic references for JWT_* / MSSQL_* /
provider credentials - never a real password, API token, or JWT string.

## Out of scope for this playbook

- Production deploy from a PR / CI approval gate (separate FR)
- `npm run deploy` wrapper + account/region knobs (**FR-141**)
- Automated smoke script (**FR-144**)
- Enabling stay-dark providers
- Creating sandbox DB DDL on IONOS (ops runbook after FR-121)
