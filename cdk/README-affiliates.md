# AAffiliates (FR #3999)

Standalone CDK app for the private **a-affiliates** S3 bucket and weekly parts
download Lambda. Does **not** touch `ASearchStack`, `APartsGateway`, RDS/MSSQL,
VPC, `a-clubs`, or `madeira-*` Lambdas.

## What it creates

| Resource | Notes |
|----------|--------|
| S3 bucket `a-affiliates` | Block public, SSE-S3, enforceSSL, RETAIN, no auto-delete |
| Lifecycle | Expire size>0 objects after 35 days (markers are zero-byte) |
| Node 20 Lambda | `affiliates/src/handler.handler`, 15 min, env `A_AFFILIATES_BUCKET` |
| EventBridge rule | `rate(7 days)` -> Lambda (Sunday cron is an acceptable alternative) |
| IAM | Get/Put/List/DeleteObject on this bucket only |

**Runtime choice:** Lambda for v1. Switch to Fargate later if 15 min or
ephemeral storage is insufficient for large feeds.

**Bucket name:** code and outputs use `a-affiliates`. If that global name is
taken at deploy time, use `a-search-affiliates` and record the real name in
outputs (documented fallback).

Full layout and metadata keys: [docs/a-affiliates.md](../docs/a-affiliates.md).

## Synth / deploy

Target: account `620257466932`, region `eu-west-2`.

```bash
npm ci
npm run stage-affiliates
npx cdk synth --app "node cdk/bin/affiliates.js" AAffiliates \
  -c account=620257466932 -c region=eu-west-2

npx cdk deploy --app "node cdk/bin/affiliates.js" AAffiliates \
  -c requireDeployEnv=true \
  -c account=620257466932 -c region=eu-west-2
```

`cdk diff` for this app should show **only** new AAffiliates resources.

Bob deploys after MRB PASS + merge (fleet playbook).
