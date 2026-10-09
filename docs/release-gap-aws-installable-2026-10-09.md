# a-search production gaps → AWS installable release

Date: 2026-10-09  
Baseline: `origin/main` @ `0342707` (`repo-main/` worktree)  
Goal: **installable AWS product** — `cdk deploy` brings up entry + enabled workers + maintainer + onboarding for the **already-enabled** registry sources (amazon, ebay, rakuten, cj, awin, impact), with secrets, S3, SQL connectivity, CI, and a smoke path. Stay-dark Phase-2 providers are **out of scope** for v0.1 installable.

## Already filed (Phase-3 unlock)

| Issue | FR | Role |
|------:|----|------|
| #950 | FR-121 | Sandbox MSSQL = separate DB on same instance (**decision LOCKED**) |
| #951 | FR-122 | AWS→IONOS network path |
| #952 | FR-123 | JWT deploy docs |
| #953 | FR-124 | rclone letter + S3 scheme |
| #954 | FR-125 | Awin live onboarding drain |
| #955 | FR-126 | Enable-provider template (later accounts) |
| #956 | FR-127 | Draft PR hygiene |

## Release definition (LOCKED for this wave)

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
| CDK maintainer schedules | Yes | Partial — asset broken (shared/) |
| CDK awin/impact onboarding Lambdas | Yes | Partial — asset broken; impact **live** EventBridge rule **missing** |
| S3 results bucket in CDK | **No** | **Yes** |
| `S3_RESULTS_BUCKET` + IAM PutObject/GetObject | **No** | **Yes** |
| JWT_* / MSSQL_* / provider secrets in CDK | **No** | **Yes** |
| Worker zip includes `@aws-sdk/client-s3` + `mssql` | **No** (entry stages SDK; workers do not) | **Yes** |
| Maintainer zip includes `shared/` | **No** (`Code.fromAsset(maintainer/src)` only; schedule requires shared/intake) | **Yes** |
| Onboarding zip includes `shared/` | **No** (requires shared/identity) | **Yes** |
| SQS DLQ | **No** | Yes (ops safety) |
| CloudWatch retention / alarms | **No** | Yes (ops safety) |
| `.github/workflows` CI | **No** | **Yes** (vision S4) |
| `docs/deploy.md` / install playbook | **No** | **Yes** |
| `npm run deploy` / account-region context | Partial (README only) | Yes |
| Post-deploy smoke | **No** | Yes |
| VERSION + release checklist | **No** | Yes |
| Sandbox DB create + DDL apply runbook | UNKNOWN/ops | Yes (after #950) |
| rclone SQL-host runbook | Partial (`rclone-results.md`) | Yes (after #953) |
| VPC / egress to IONOS | UNKNOWN | Yes (after #951) |
| Stay-dark provider enable | Explicitly deferred | No for v0.1 |

## Small FR backlog (this wave)

See `docs/fr/FR-128.md` … and `ISSUED-RELEASE.tsv` after filing.  
Anti-omnibus: one Goal / Deliverables / Testable issue each; one PR per issue.
