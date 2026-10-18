# APartsGateway (FR #3968)

Standalone CDK app for the **parts widget** `GET /parts` route. Deploys on its
own --- it does **not** touch `ASearchStack`, RDS/MSSQL, VPC, or `madeira-*`
Lambdas.

## What it creates

| Resource | Notes |
|----------|--------|
| HTTP API | `GET /parts` + CORS (`-c corsOrigins=`) |
| Node 20 Lambda | `parts-gateway/src/handler.handler` |
| IAM | `s3:GetObject` / `PutObject` / `ListBucket` / Head + tagging on `arn:aws:s3:::a-clubs` and `a-clubs/*` only |

The Lambda expects the **existing** bucket `a-clubs` in the deploy account. It
auto-creates `a-clubs/{hostkey}/` (Madeira checksum userid metadata;
`customerNumber` === `userid`) and `a-clubs/{hostkey}/{guid}/` seeded files on
first request.

## Synth / deploy

Target: account `620257466932`, region `eu-west-2`.

```bash
npm ci
npm run stage-parts-gateway
npx cdk synth --app "node cdk/bin/parts-gateway.js" APartsGateway \
  -c account=620257466932 -c region=eu-west-2

npx cdk deploy --app "node cdk/bin/parts-gateway.js" APartsGateway \
  -c requireDeployEnv=true \
  -c account=620257466932 -c region=eu-west-2 \
  -c corsOrigins=https://your-club-host.example
```

`cdk diff` for this app should show **only** new APartsGateway resources.

## Smoke

```bash
curl -sS "$PartsGatewayApiUrl/parts?host=example.com&widgetGuid=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
```

Repeat the same URL --- response stays 200 (idempotent). A mismatched `Origin`
header yields `403` `widget_host_mismatch`.

Bob deploys after MRB PASS + merge (fleet playbook).
