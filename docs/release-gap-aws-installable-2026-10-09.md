# a-search production gaps -> AWS installable release

Date: 2026-10-09  
Baseline: `origin/main` @ `0342707` (`repo-main/` worktree)  
Goal: **installable AWS product** - `cdk deploy` brings up entry + enabled workers + maintainer + onboarding for the **already-enabled** registry sources (amazon, ebay, rakuten, cj, awin, impact), with secrets, S3, SQL connectivity, CI, and a smoke path. Stay-dark Phase-2 providers are **out of scope** for v0.1 installable.

## Already filed (Phase-3 unlock)

| Issue | FR | Role |
|------:|----|------|
| #950 | FR-121 | Sandbox MSSQL = separate DB on same instance (**decision LOCKED**) |
| #951 | FR-122 | AWS->IONOS network path |
| #952 | FR-123 | JWT deploy docs |
| #953 | FR-124 | rclone letter + S3 scheme |
| #954 | FR-125 | Awin live onboarding drain |
| #955 | FR-126 | Enable-provider template (later accounts) |
| #956 | FR-127 | Draft PR hygiene |

## Release definition (LOCKED for this wave)

Canonical DoD doc: [`docs/release-installable.md`](release-installable.md) (FR-128).

An **installable release** means:

1. `npm test` and `npm run synth` pass on Node 20 in CI  
2. `npx cdk deploy ASearchStack` creates API + queues + workers + maintainer + onboarding for enabled sources  
3. Secrets (JWT, MSSQL, provider keys, `S3_RESULTS_BUCKET`) are wired without committing secrets  
4. Workers can PutObject results; entry can SQS fan-out; local workers can SELECT Parts  
5. Ops runbooks exist for DDL, rclone, and post-deploy smoke  
6. A tagged VERSION / release checklist exists  

**Not required for v0.1:** enabling stay-dark providers; Amazon Creators API; cutover off madeira-sqs-affiliate account IDs; Grok relevance.

## Gap matrix (evidence on main)

| Area | On main today | Blocker? |
|------|---------------|----------|
| CDK entry + API GW `/search` `/selftest` `/account/performance` | Yes | No |
| CDK queues/workers for enabled sources | Yes | No |
| CDK maintainer schedules | Yes | No (FR-131 stages `maintainer/src` + `shared/`) |
| CDK awin/impact onboarding Lambdas | Yes (EventBridge live impact rule **Yes** - FR-133) | Partial - onboarding zip `shared/` still broken (FR-132 landed shared staging; verify asset) |
| S3 results bucket in CDK | **Yes** (FR-129 `ResultsBucket`) | No |
| `S3_RESULTS_BUCKET` + IAM PutObject/GetObject | **Yes** (FR-130 `wireResultsBucketAccess`) | No |
| JWT_* entry Secrets Manager (FR-136) | **Yes** (FR-136) | No |
| MSSQL_* Secrets Manager (FR-137) | **Yes** (FR-137 #973) - maintainer + local workers + onboarding | No |
| provider secrets in CDK (FR-138) | **Yes** (FR-138 #974) - per-source Secrets Manager on enabled workers + awin/impact onboarding; stay-dark omitted | No |
| secrets-matrix.md (which Lambda / keys) | **Yes** - `docs/secrets-matrix.md` + README pointer (FR-150 #986); no values | Yes |
| Worker zip includes `@aws-sdk/client-s3` + `mssql` | **Yes** - `@aws-sdk/client-s3` + `@smithy` (FR-134); `mssql` staged for `providers/local/*` + maintainer (FR-135 #971 / #1113) | No |
| Maintainer zip includes `shared/` + `mssql` | **Yes** (`scripts/stage-maintainer-lambda-asset.js`; FR-131 shared + FR-135 mssql) | No |
| Onboarding zip includes `shared/` | **Yes** (FR-132 `stage-onboarding-lambda-asset.js`) | No |
| SQS DLQ | **Yes** (FR-142 #978 - DLQ + maxReceiveCount 3 per enabled worker queue) | Yes (ops safety) |
| CloudWatch retention / alarms | **Yes** (FR-143 #979 - 30d LogGroup + DLQ depth alarms to placeholder SNS) | Yes (ops safety) |
| `.github/workflows` CI | **Yes** - `.github/workflows/ci.yml` Node 20 `npm ci` + `npm test` + `npm run synth` on PR/push main (FR-139 #975) | **Yes** (vision S4) |
| `docs/deploy.md` / install playbook | **Yes** - bootstrap, secrets, cdk deploy, SearchApiUrl, smoke, rclone (FR-140 #976; keeps FR-136 JWT section) | **Yes** |
| `npm run deploy` / account-region context | **Yes** - `npm run deploy` + `-c account`/`region` via `resolve-deploy-env` (FR-141 #977); no account IDs in source | **Yes** |
| Post-deploy smoke | **Yes** (FR-144 #980 - `scripts/smoke-deploy.js` + mocked pin) | Yes |
| VERSION + release checklist | **Yes** (FR-145 #981 - `VERSION` 0.1.0 + `docs/release-checklist.md`) | Yes |
| Sandbox DB create + DDL apply runbook | **Yes** (FR-146 #982 - `docs/sql/apply-ddl-runbook.md`; recommended DB `a_search_sandbox`) | Yes (after #950) |
| rclone SQL-host runbook | **Yes** (FR-147 #983 - step-by-step mount in `docs/rclone-results.md`) | Yes (after #953) |
| VPC / egress to IONOS | **Yes** - explicit no-VPC CDK + deploy.md fixed-egress allowlist steps (FR-149 #985; FR-122 surface) | **Yes** |
| Stay-dark provider enable | Explicitly deferred | No for v0.1 |

## Small FR backlog (this wave)

See `docs/fr/FR-128.md` ... and `ISSUED-RELEASE.tsv` after filing.  
Anti-omnibus: one Goal / Deliverables / Testable issue each; one PR per issue.
