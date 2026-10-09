# Deploy a-search (AWS CDK)

Installable deploy notes for `ASearchStack`. Secrets never belong in git.

## Prerequisites

- Node >= 20, `npm install`, `npm run synth` exit 0
- AWS credentials / account+region for `cdk deploy`
- See [cdk/README.md](../cdk/README.md) for stack contents

## npm run deploy (FR-141)

Pass account + region via CDK context (never commit account IDs):

```bash
npm run deploy -- -c account=ACCOUNT_ID -c region=eu-west-2
```

`npm run deploy` sets `-c requireDeployEnv=true` so a missing account exits
with `FR-141: missing deploy account...`. Aliases: `deployAccount` /
`deployRegion`. Fallback env: `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION`.

## Entry JWT_* via Secrets Manager (FR-136)

Entry Lambda verifies Bearer tokens using **FR-123** key names
(`JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_JWKS_URL` or `JWT_SECRET` — see
[endpoint-search.md](endpoint-search.md) **JWT deploy config (FR-123)**).

CDK wires those keys from a Secrets Manager **JSON** secret (CloudFormation
dynamic references). Values never appear in synth snapshots or git.

### Context ARN (preferred)

Pass an existing secret complete ARN:

```bash
npx cdk deploy -c jwtSecretArn=arn:aws:secretsmanager:REGION:ACCOUNT:secret:name-XXXXXX
```

Secret JSON keys (string fields):

| Key | Notes |
|-----|--------|
| `JWT_ISSUER` | Required at runtime |
| `JWT_AUDIENCE` | Required at runtime |
| `JWT_JWKS_URL` | Prefer for production (asymmetric) |
| `JWT_SECRET` | HS256 lab/fixtures; optional if JWKS set |
| `JWT_HS256_SECRET` | Optional alias — entry also accepts this name; put it in JSON if you use the alias instead of `JWT_SECRET` |

### Created secret (no context)

When `jwtSecretArn` is omitted, the stack creates `EntryJwtSecret` for ops to
populate after first deploy. Output `EntryJwtSecretArn` prints the ARN. Put the
JSON keys above into that secret, then redeploy or update the secret in-place
(Lambda env already references the fields).

### Grants

Entry receives `secretsmanager:GetSecretValue` (and decrypt) on that secret only
(`grantRead`) — never `Resource *` for secrets.

### Cross-links

- Key names + fail-closed behaviour: [endpoint-search.md](endpoint-search.md) FR-123
- Release DoD: [release-installable.md](release-installable.md)
- MSSQL / provider Secrets Manager wiring: FR-137 / FR-138 (separate issues)

## Synth check

```bash
npm run synth
```

Template must show `{{resolve:secretsmanager:...}}` (or equivalent) for JWT_* —
never a real JWT or HS256 secret string.
