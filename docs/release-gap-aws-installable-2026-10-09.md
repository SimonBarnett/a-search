# a-search production gaps â†’ AWS installable release

Date: 2026-10-09  
Baseline: `origin/main` @ `0342707` (`repo-main/` worktree)  
Goal: **installable AWS product** â€” `cdk deploy` brings up entry + enabled workers + maintainer + onboarding for the **already-enabled** registry sources (amazon, ebay, rakuten, cj, awin, impact), with secrets, S3, SQL connectivity, CI, and a smoke path. Stay-dark Phase-2 providers are **out of scope** for v0.1 installable.

## Already filed (Phase-3 unlock)

| Issue | FR | Role |
|------:|----|------|
| #950 | FR-121 | Sandbox MSSQL = separate DB on same instance (**decision LOCKED**) |
| #951 | FR-122 | AWSâ†’IONOS network path |
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
| CDK awin/impact onboarding Lambdas | Yes (EventBridge live impact rule **Yes** â€” FR-133) | Partial â€” onboarding zip `shared/` still broken (FR-132 landed shared staging; verify asset) |
| S3 results bucket in CDK | **Yes** (FR-129 `ResultsBucket`) | No |
| `S3_RESULTS_BUCKET` + IAM PutObject/GetObject | **Yes** (FR-130 `wireResultsBucketAccess`) | No |
| JWT_* entry Secrets Manager (FR-136) | **Yes** (FR-136) | No |
| MSSQL_* Secrets Manager (FR-137) | **Yes** (FR-137 #973) - maintainer + local workers + onboarding | No |
| provider secrets in CDK (FR-138) | **Yes** (FR-138 #974) - per-source Secrets Manager on enabled workers + awin/impact onboarding; stay-dark omitted | No |
| Worker zip includes `@aws-sdk/client-s3` + `mssql` | **Yes** - `@aws-sdk/client-s3` + `@smithy` (FR-134); `mssql` staged for `providers/local/*` + maintainer (FR-135 #971 / #1113) | No |
| Maintainer zip includes `shared/` + `mssql` | **Yes** (`scripts/stage-maintainer-lambda-asset.js`; FR-131 shared + FR-135 mssql) | No |
| Onboarding zip includes `shared/` | **Yes** (FR-132 `stage-onboarding-lambda-asset.js`) | No |
| SQS DLQ | **No** | Yes (ops safety) |
| CloudWatch retention / alarms | **No** | Yes (ops safety) |
| `.github/workflows` CI | **No** | **Yes** (vision S4) |
| `docs/deploy.md` / install playbook | **Yes** (FR-136 `docs/deploy.md`) | Partial (expand install playbook) |
| `npm run deploy` / account-region context | Partial (README only) | Yes |
| Post-deploy smoke | **No** | Yes |
| VERSION + release checklist | **No** | Yes |
| Sandbox DB create + DDL apply runbook | UNKNOWN/ops | Yes (after #950) |
| rclone SQL-host runbook | Partial (`rclone-results.md`) | Yes (after #953) |
| VPC / egress to IONOS | UNKNOWN | Yes (after #951) |
| Stay-dark provider enable | Explicitly deferred | No for v0.1 |

## Small FR backlog (this wave)

See `docs/fr/FR-128.md` â€¦ and `ISSUED-RELEASE.tsv` after filing.  
Anti-omnibus: one Goal / Deliverables / Testable issue each; one PR per issue.
