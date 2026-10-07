# a-search gap analysis (post FR-001..030)

- Plan session: `plan-20261007-142747`
- Target repo: `SimonBarnett/a-search` @ `2ee021a` (origin/main after ff)
- Open GitHub issues: **none** (FR-001..030 all closed)
- Local note: `C:\ai\a-search` was behind origin until this session `git pull --ff-only`

## Vision success vs tree

| id | Status | Evidence |
|----|--------|----------|
| S1 fan-out accept | **Met in tests** | `tests/fanout.test.js`; default `sendMessage` still **noop** (no live SQS) |
| S2 env isolation | **Met in tests** | `tests/env-isolation*.test.js` |
| S3 registry on/off | **Met** | `providers/registry.json` + tests |
| S4 Node+IaC | **Partial** | CDK skeleton + synth script; **no API Gateway**; queues only for **amazon**; entry asset is `entry/src` only |
| S5 JWT userId | **Met in tests** | `tests/auth-jwt.test.js` / `jwt-auth.test.js` |
| S6 live/sandbox | **Met in helpers** | queue names + assertEnv; CDK does not yet create non-amazon queues |
| S7 maintainer roll | **Modules yes, entry no** | `roll.js`/`fetch.js`/`upsert.js`/`delete.js` + SQL exist; `maintainer/src/schedule.js` **still returns stub** (`processed: 0`) |
| S8 skillbooks | **Met** | folder skillbooks + layout tests |
| S9 caller skill | **Met** | `.grok/skills/a-search-endpoint` |

## Concrete gaps (ordered for next backlog)

1. **Maintainer schedule does not orchestrate** roll → fetch → upsert → delete (S7 broken at Lambda entry).
2. **No AWS SDK defaults**: entry enqueue `sendMessage` noop; `writeResults` requires injected `putObject` / bucket.
3. **CDK incomplete vs vision**: missing API Gateway `POST /search`; missing per-source live/sandbox queues beyond amazon; missing SQS→worker Lambdas; entry Code.fromAsset cannot see `providers/` for registry.
4. **queueEnv vs CDK env names**: registry `SQS_AMAZON_URL` vs CDK `SQS_AMAZON_LIVE_URL` / `_SANDBOX_URL` — resolve layer missing.
5. **Live clients**: only **amazon** has SearchItems + normalize + writeResults; **ebay / rakuten / cj** remain stubs (enabled:true in registry).
6. **Local search**: **awin** has injectable `queryParts` defaulting to `[]` (no SqlClient); **impact** is still a message-only stub.
7. **Amazon worker has no SQS Lambda handler wrapper** in-repo (exports `run(msg)` only); CDK has no amazon worker function.
8. **Amazon API:** Phase 1 LOCKED to PA-API SearchItems (FR-045); Creators API is a follow-up FR (was: vision preferred Creators while FR-030 shipped PA-API).
9. **Result product schema** not locked across providers (amazon normalize exists; others do not).
10. **Deploy / secrets playbook** (JWT issuer, Secrets Manager, S3 bucket, MSSQL connection) still UNKNOWN in vision.

## Out of scope this wave (stay UNKNOWN unless human locks)

- Grok relevance phase
- Exact rclone drive letter
- AWS account IDs / cutover off madeira-sqs-affiliate
- Enabling disabled shortlist providers (kelkoo, etsy, …)
