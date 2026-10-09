# AWS installable release - v0.1 Definition of Done

**FR-128.** Canonical Definition of Done for the **v0.1 AWS installable**
wave. Gap evidence and FR backlog live in
[`docs/release-gap-aws-installable-2026-10-09.md`](release-gap-aws-installable-2026-10-09.md)
and [`docs/feature-request-phase3-aws-installable-2026-10-09.md`](feature-request-phase3-aws-installable-2026-10-09.md).
This FR **defines** the DoD only - it does not implement CI, CDK, secrets, or
smoke (later FRs).

## What "installable" means

Operators can `cdk deploy` a-search so **already-enabled** registry sources
(`amazon`, `ebay`, `rakuten`, `cj`, `awin`, `impact`) accept JWT search, fan
out to SQS, write S3 results, reach MSSQL for local Parts, and pass a post-
deploy smoke path - **without committing secrets**.

## Success (v0.1 DoD)

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| D1 | CI gate | `npm test` + `npm run synth` on Node 20 in GitHub Actions | workflow on PR / main | No CI, or synth skipped |
| D2 | cdk deploy | `npx cdk deploy` (or `npm run deploy`) creates API + queues + workers + maintainer + onboarding for **enabled** sources | synth template + deploy docs | Missing Lambda/queue for an enabled id |
| D3 | Secrets | JWT_*, MSSQL_*, provider credentials, `S3_RESULTS_BUCKET` via Secrets Manager / context - never git | synth secret-scan + docs | Passwords or keys in repo or plaintext template |
| D4 | S3 results | Results bucket exists; Lambdas have `S3_RESULTS_BUCKET` + PutObject/GetObject IAM | synth + pin | Workers throw missing bucket / AccessDenied |
| D5 | Smoke | Post-deploy script: JWT fixture -> `POST /search` 200 accept + `/selftest` shape | unit pin + ops after deploy | No smoke path |
| D6 | VERSION | Tagged VERSION + release checklist pointing at this DoD | `VERSION` file + checklist pin | No installable tag criteria |
| D7 | Stay-dark OOS | Phase-2 stub ids remain `enabled.live/sandbox=false` | registry pin (FR-061 / FR-126) | Accidental bulk enable |

## Explicitly out of scope for v0.1

- Enabling stay-dark Phase-2 providers (FR-126 one-provider ritual /
  [`docs/phase3-enable-provider.md`](phase3-enable-provider.md) /
  [`docs/phase2-providers.md`](phase2-providers.md))
- Amazon Creators API
- Cutover off legacy madeira-sqs-affiliate account IDs
- Grok relevance ranking
- Stamping UAT / plan-seat `cdk deploy` to production from this DoD doc alone

## Related runbooks (filled by later FRs)

- Deploy playbook: `docs/deploy.md` (FR-140)
- Secrets matrix: `docs/secrets-matrix.md` (FR-150)
- Sandbox DB + DDL: ops FRs after FR-121
- rclone SQL-host mount: `docs/rclone-results.md` (FR-124)
- Enable one provider: FR-126 / `docs/phase2-providers.md` stay-dark rule

## Pin

`tests/fr128-release-installable-docs.test.js`
