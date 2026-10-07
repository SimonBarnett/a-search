# Feature request wave: a-search Phase 1 (post FR-001..030)

**Target repo:** `SimonBarnett/a-search` (existing — do **not** `gh repo create`)
**Shape:** reuse LOCKED **service** from `docs/vision.md`
**Plan session:** `plan-20261007-142747`
**Status:** GitHub issues opened — FR-031..045 as SimonBarnett/a-search#91..#105 (`feature-request`)

## Objective

Make the already-scaffolded accept path produce real offline work: maintainer
schedule runs the roll pipeline, entry talks to real SQS, workers for every
**enabled** registry source write canonical results, and CDK exposes
`POST /search` behind API Gateway.

LOCKED (wave objective) / UNKNOWN (deploy account + JWT issuer values)

## Success

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| P1 | Maintainer schedule orchestrates | `schedule.handler` calls roll→fetch→upsert→delete for due keys; `processed` equals rolled count in fixture test | `tests/maintainer-schedule.test.js` | Stub still returns `processed: 0` with no module calls |
| P2 | Live SQS enqueue default | With AWS creds/env queue URLs, default `sendMessage` uses SQS client; unit test with injected client still passes; mock SDK test asserts SendMessage called once per enabled source | `tests/sqs-send.test.js` | Default path remains forever-noop with no AWS client module |
| P3 | Results land in S3 via default put | `writeResults` without injected `putObject` uses S3 client when `S3_RESULTS_BUCKET` set; fixture test with mock client | `tests/write-results-s3.test.js` | Production path requires inject-only putObject |
| P4 | API Gateway accept surface | CDK synth emits API Gateway (or HTTP API) route `POST /search` → entry Lambda | `npm run synth` + `tests/cdk-apigw.test.js` | Synth has entry Lambda and no HTTP API resource |
| P5 | Enabled providers searchable | ebay, rakuten, cj, awin, impact each have non-stub `run` that returns products array (fixture or SQL mock) and writes via `writeResults` | per-provider `*-search.test.js` | Enabled registry id still returns scaffold-only message string with no products path |

At least one row LOCKED above. Deploy account IDs / live JWT issuer remain UNKNOWN.

## Shape

Primary: **service** (unchanged). HTML mocks already in repo `docs/mocks/`;
no new UI screens required for this wave.

LOCKED

## Gap vs current tree

See `GAP-ANALYSIS.md` in this plan folder. Summary: FR-001..030 closed;
amazon client real; maintainer modules real but schedule stub; enqueue/S3
defaults injectable-only; CDK missing API GW and non-amazon workers;
ebay/rakuten/cj/awin/impact still stubs.

## Proposed small FRs

`docs/fr/FR-031.md` … `FR-045.md` — each Goal / Deliverables / Testable.
Prefer **one PR per issue**.

## Out of scope

- Enabling disabled shortlist providers
- Grok relevance
- Cutover off madeira-sqs-affiliate
- Stamping UAT / creating releases from Plan seat
