# AMerchants (FR #4008)

Standalone CDK app for the private **a-merchants** S3 bucket, ObjectCreated
immediate download Lambda, and weekly dual-bucket parts download Lambda. Does
**not** touch the main search stack, `APartsGateway`, RDS/MSSQL, VPC, clubs
bucket, or madeira Lambdas.

## What it creates

| Resource | Notes |
|----------|--------|
| S3 bucket `a-merchants` | Block public, SSE-S3, enforceSSL, RETAIN, no auto-delete |
| Lifecycle | Expire size>0 objects after 35 days (`objectSizeGreaterThan: 0`) |
| Node 20 weekly Lambda | `merchants/src/handler.handler`, 15 min, env `A_MERCHANTS_BUCKET` + `A_AFFILIATES_BUCKET` |
| Node 20 onCreated Lambda | `merchants/src/handler.onCreatedHandler`, ObjectCreated -> one merchant |
| EventBridge rule | `rate(7 days)` -> weekly Lambda |
| IAM | Get/Put/List/DeleteObject on a-merchants **and** a-affiliates |

**Weekly choice:** ONE weekly Lambda in this stack covers both buckets. Affiliates
bucket env may be cleared if unused. See [docs/a-merchants.md](../docs/a-merchants.md).

**Bucket name:** code and outputs use `a-merchants`. If that global name is
taken at deploy time, use `a-search-merchants` and record the real name in
outputs (documented fallback).

## Synth / deploy

Target: account `620257466932`, region `eu-west-2`.

```bash
npm ci
npm run stage-merchants
npx cdk synth --app "node cdk/bin/merchants.js" AMerchants \
  -c account=620257466932 -c region=eu-west-2

npx cdk deploy --app "node cdk/bin/merchants.js" AMerchants \
  -c requireDeployEnv=true \
  -c account=620257466932 -c region=eu-west-2
```

`cdk diff` for this app should show **only** new AMerchants resources.

Bob deploys after MRB PASS + merge (fleet playbook).
