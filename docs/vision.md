# Vision: a-search

New-product vision pack for `SimonBarnett/a-search`. Evolves the Madeira
affiliate search connectors in
`SimonBarnett/AWS/SQS/madeira-sqs-affiliate/routes` into a dedicated Node-on-AWS
service with one search entry point and per-source isolation.

Source reference (read-only legacy):
`https://github.com/SimonBarnett/AWS/tree/main/SQS/madeira-sqs-affiliate/routes`
(connectors today: `awin.js`, `eBay.js`, `paapi.js`).

Skill: `visionary`.

## Objective

One JWT-authenticated HTTP search call fans out work to every enabled live
marketplace provider and every enabled local MSSQL-backed part source, each
isolated in its own folder with its own `.env` and skillbook, while a
scheduled maintainer keeps local parts fresh from CSV/feeds - with live and
sandbox environments isolated through queues, SQL, and rclone-mapped result
paths on the SQL server.

LOCKED

## Success

| id | metric | target | how measured | fail-when |
|----|--------|--------|--------------|-----------|
| S1 | Single search fan-out completeness | One `POST /search` returns **200** after accepting the job and enqueues exactly one SQS message per enabled source for that **env** (live\|sandbox); processing continues offline | Integration test under `tests/fanout.test.js` asserts HTTP 200, `searchId`, and message count equals enabled sources for the request env | Non-200 on valid accept, missing `searchId`, or enabled source skipped |
| S2 | Per-source secret isolation | No provider folder reads another folder's `.env`; entry loads only entry `.env` | `tests/env-isolation.test.js` + CI `tests` job | Cross-folder env leak |
| S3 | Extensibility + per-source on/off | New source = folder + registry + queue; toggle via registry `enabled` (per env) | `tests/registry.test.js` + `docs/add-source.md` | Disabled source enqueued or core `entry/` rewrite required |
| S4 | Deployable Node on AWS | Entry + workers + maintainer deploy as Node 20 with IaC in repo | `npm test` + `sam validate` / `npm run synth` in CI | No IaC or Node &lt; 18 |
| S5 | JWT user id drives search + results path | Bearer JWT `userId` required; copied to SQS and result keys; body cannot override | `tests/auth-jwt.test.js` | Accept without JWT or path user id - claim |
| S6 | Live/sandbox isolation | live and sandbox use separate queue names, SQL targets, and result path prefixes; worker refuses wrong-env messages | `tests/env-isolation-runtime.test.js` asserts cross-env enqueue/write blocked | Sandbox job writes live path or live SQL |
| S7 | Rolling parts maintainer | Scheduled task refreshes only due feed keys from MSSQL; conditional download before blind pull; set-based upsert + scoped delete | `tests/maintainer-roll.test.js` (fixture keys, 304/hash skip, MERGE staging) | Full-estate blind download every tick, or row-by-row upserts only |
| S8 | Per-folder skillbooks | Each entry/provider/maintainer folder has `AGENTS.md` + `.grok/skills/a-search-<id>/SKILL.md` so an agent CWD there can maintain that integration alone | Repo layout test / checklist `docs/skillbook-layout.md` counts required files | Amazon agent must load awin skill to debug amazon |
| S9 | Caller endpoint skillbook | Product ships `.grok/skills/a-search-endpoint/SKILL.md` so an agent can call `POST /search` with JWT, env, and result-path playbook | File present in repo; fixture agent checklist in `docs/skillbook-layout.md` | Callers only have HTTP docs with no agent skill |
| S10 | Harvest CAST IRON in every agent CWD | Every `AGENTS.md` + `a-search-*` SKILL.md contains the CAST IRON harvest block and intake `POST /bob/v1/intake` with explicit `-Repo SimonBarnett/a-search` | `tests/skillbook-harvest.test.js` enumerates entry/maintainer/providers/endpoint and asserts CAST IRON + intake + `-Repo` needles | Any required agent CWD missing the harvest block |
| S11 | Shared layer only for shared code | `resultsPath`, `writeResults`, `assertEnv`, intake reporter, and related helpers live under `shared/` (Lambda layer `/opt/nodejs/a-search`); providers do not copy-paste those helpers | `tests/shared-no-dup.test.js` + FR-047 shared-package / resultsPath / writeResults pin tests; `docs/shared-layer.md` | Duplicate shared helpers reappear under `providers/*/src` |
| S12 | Deterministic exceptions --- a-search intake | Uncaught/handled fatal errors in entry/worker/maintainer/onboarding call the intake helper with `repo=SimonBarnett/a-search` (deduped; secrets redacted) | `tests/report-exception.test.js` + FR-048 entry/amazon/maintainer intake pins; `docs/intake-on-exception.md` | Fatal path logs only and never POSTs intake |
| S13 | Local onboarding agents | Each enabled local source has an `onboarding/` agent CWD + scheduled runner that drains until `remaining=0` then exits | `tests/onboarding-drain.test.js` + FR-049 awin/impact scaffold pins; `docs/onboarding-agents.md` | No onboarding folder for awin/impact, or runner loops forever with no exit |
| S14 | Daily report signup feed | Onboarding emits signup rows compatible with clubscan daily report fields (new merchants / counts) documented vs madeira-awin-clubscan | `tests/fr052a-daily-report-signups-docs.test.js` + FR-052 write/read signup pins; `docs/daily-report-signups.md` | Signup payload undocumented or missing new-advertiser rows |
| S15 | Performance endpoint | JWT `GET`/`POST` `/account/performance` returns clicks/visits/sales for that JWT `userId` (body cannot override) | `tests/fr053a-endpoint-performance-docs.test.js` + FR-053 stub/aggregate pins; `docs/endpoint-performance.md` | Endpoint missing or ignores JWT `userId` |
| S16 | Persist local S3 mapping | Service upserts mapping records (token/link --- S3 key) durable under `{env}/_mapping/` and readable for performance joins | `tests/fr054b-mapping-upsert-get.test.js` + FR-054c S3 store / FR-054d writeResults pins; `docs/s3-mapping.md` | Mapping only in memory / lost across invokes |
| S17 | Tracked affiliate links | Every created offer URL stamps JWT `userId` tenant + provider folder `.env` account via `buildTrackedUrl`; fail closed if account/tenant missing | `tests/fr057c-amazon-build-tracked-url.test.js` + FR-057 provider pins; `docs/tracked-links.md` | Untracked raw offer URL, body-supplied tenant, or hardcoded publisher id |
| S18 | Paced SQS consumers vs 407/429 | Enabled source workers stay within vendor-safe concurrency (`batchSize: 1` + registry `rateLimit.maxConcurrency` / minInterval / throttle backoff) so fixture load does not provoke provider **407** / **429** (or equivalent blocks) | `docs/sqs-pacing.md` + FR-058a-j pins (`tests/fr058a-sqs-pacing-docs.test.js`, maxConcurrency / minInterval / throttleBackoff tests) | Sustained 407/429 under fixture load, or workers with unbounded concurrency / high `batchSize` against a rate-limited API |
| S19 | Provider selftest + intake on fail | JWT `GET`/`POST` `/selftest` returns per-provider health for live\|sandbox; each `ok=false` probe files intake with `repo=SimonBarnett/a-search` (deduped, secrets redacted) | `docs/endpoint-selftest.md` + FR-059a-l pins (`tests/fr059a-endpoint-selftest-docs.test.js`, stub/orchestrator/intake/probe/CDK route tests) | Selftest missing, ignores JWT `userId`, or failed probes never POST intake |
| S20 | Provider onboarding skillbooks | Every enabled provider agent CWD includes `a-search-<id>-onboarding/SKILL.md` (CAST IRON harvest; obtain `.env`; sandbox vs live; selftest pointer) so an agent can onboard that source alone | `docs/provider-onboarding-skills.md` + FR-060a-i pins (`tests/provider-onboarding-skills.test.js`, FR-060c-h body / FR-060i stub tests) | Enabled provider missing onboarding skillbook, or agent must load a sibling provider skill to onboard |

LOCKED

## Shape

Primary (one): **service**

Hybrid note: HTTP search API + SQS workers + scheduled parts maintainer are
the product. HTML mocks document gateway accept/empty/error. Club Madeira UI
stays outside this repo.

LOCKED

## Stack

Default: **Node.js 20+ on AWS** - API Gateway - entry Lambda; per-source SQS
- workers; EventBridge - maintainer task; **MSSQL** for local parts + feed
keys; results in **S3** exposed on the SQL server as an **rclone mapped
drive**; per-folder `.env` / Secrets Manager; **live** and **sandbox**
isolated.

Why: Matches Madeira Node connectors, keeps credentials isolated, keeps
parts searchable locally, and lets the SQL host consume results via familiar
paths without inventing a second store.

Why-not:
- Single shared Lambda + shared env (legacy affiliate) - blast radius / secrets.
- Sync multi-HTTP from entry - latency and rate-limit coupling.
- Local parts only in OpenSearch/files - MSSQL is the LOCKED parts store.
- Results only as abstract S3 with no SQL-host mount - ops need rclone drive
  on the SQL server.

LOCKED

## Architecture

```
Caller (login -> JWT)
        |
        +------------------+------------------+
        v                                     v
  API Gateway                          API Gateway
  POST /search  [live|sandbox]         GET|POST /account/performance
  Authorization: Bearer <jwt>          Authorization: Bearer <jwt>
        |                                     |
        v                                     v
  entry/  (entry/.env + a-search-entry)   entry/ performance handler
    - verify JWT -> userId                  - JWT userId only (no body override)
    - stamp env = live|sandbox              - clicks/visits/sales + date range
    - fan-out SQS per enabled source        - reads mapping + env-isolated stats
    - 200 { searchId, accepted, ... }
    - on fatal: intake POST /bob/v1/intake
      repo=SimonBarnett/a-search (redacted)
        |
        +------------ live|sandbox queues ------------+
        v                                             v
 providers/live/*                              providers/local/*
  SQS search workers                            SQS search workers
  (remote APIs)                                 (SELECT MSSQL Parts)
  on fatal -> intake                            onboarding/ (EventBridge drain)
        |                                         until remaining=0; signup rows
        |                                         for daily report (clubscan)
        +------------------+--------------------------+
                           v
         shared/  (Lambda layer /opt/nodejs/a-search)
           resultsPath, writeResults, assertEnv, intake,
           mapping upsert/get/list, signup read/write
                           |
                           v
         Results -> S3 key:
           {env}/{source}/{userId}/{catalogId}/{searchId}.json
         Mapping -> S3:
           {env}/_mapping/{userId}/{source}/{tokenHash}.json
         Signups -> S3:
           {env}/_reports/{source}/{day}/signups.json
         SQL server: rclone mirrors same tree

  maintainer/  (EventBridge schedule, maintainer/.env)
    - roll due PartFeedKeys from MSSQL (per env DB/schema)
    - conditional GET / hash before full CSV download
    - staging bulk + MERGE upsert; scoped delete missing parts
    - feed parsers/creds delegated to providers/local/<id>/
    - on fatal: intake POST (same as entry/workers)
```

Folder layout (repo root):

```
entry/
  AGENTS.md
  .grok/skills/a-search-entry/SKILL.md
  .env.example
  src/                         # /search + /account/performance
shared/                        # Lambda layer helpers (FR-047+)
  mapping/  intake/  onboarding/  links/
  resultsPath.js  writeResults.js  assertEnv.js
maintainer/                    # scheduled AWS task - local parts estate
  AGENTS.md
  .grok/skills/a-search-maintainer/SKILL.md
  .env.example
  src/
providers/
  registry.json                # id, kind, enabled per live/sandbox
  live/
    amazon/   ebay/  rakuten/  cj/  ...   # each: .env, AGENTS.md, skillbook, src
  local/
    awin/  impact/  partnerize/ ...       # each: feed+search skillbook, .env, src
      awin/onboarding/   impact/onboarding/  # drain agents + skillbooks
.grok/skills/
  a-search-endpoint/SKILL.md   # agent callers of POST /search
docs/
  vision.md
  endpoint-search.md
  endpoint-performance.md
  s3-mapping.md
  onboarding-agents.md
  daily-report-signups.md
  intake-on-exception.md
  shared-layer.md
  environments.md
  parts-maintainer.md
  skillbook-layout.md
  provider-shortlist.md
  mocks/                       # includes performance.html
tests/
```

Detail docs: `docs/endpoint-search.md`, `docs/endpoint-performance.md`,
`docs/s3-mapping.md`, `docs/onboarding-agents.md`,
`docs/intake-on-exception.md`, `docs/shared-layer.md`,
`docs/environments.md`, `docs/parts-maintainer.md`,
`docs/skillbook-layout.md`, `docs/provider-shortlist.md`.

LOCKED

## Screens

| id | file | state |
|----|------|-------|
| M1 | docs/mocks/home.html | primary - JWT accept + fan-out + env |
| M2 | docs/mocks/empty.html | empty - no providers enabled for env |
| M3 | docs/mocks/error.html | error - 401 JWT / 400 validation |
| W1 | docs/mocks/components-piece/home.html | ComponentsPiece - parts strip (horizontal) |
| W2 | docs/mocks/components-piece/empty.html | ComponentsPiece - empty live.json |
| W3 | docs/mocks/components-piece/error.html | ComponentsPiece - Parts error / signup gate |
| MW1 | docs/mocks/components-piece-merchant/home.html | Merchant wizard - provider + Stripe confirmed |
| MW2 | docs/mocks/components-piece-merchant/empty.html | Merchant wizard - not connected |
| MW3 | docs/mocks/components-piece-merchant/error.html | Merchant wizard - session/payment errors |
| PW1 | docs/mocks/components-piece-partner/home.html | Partner/club register + copy widget |
| PW2 | docs/mocks/components-piece-partner/empty.html | Partner/club before registration |
| PW3 | docs/mocks/components-piece-partner/error.html | Partner/club errors / payout setup |
| AL1 | docs/mocks/components-piece-auth/home.html | Shared login - OAuth + email OTP |
| AL2 | docs/mocks/components-piece-auth/empty.html | Shared login - signed out |
| AL3 | docs/mocks/components-piece-auth/error.html | Shared login - no contact / OTP error |

## LOCKED

- Repo: `SimonBarnett/a-search`; shape **service**; Node on AWS
- `POST /search` - **200** accept; offline SQS fan-out
- JWT Bearer; claim **`userId`**; body cannot override; used in SQS + result keys
- Environments: **live** and **sandbox** (queues, SQL, result prefixes isolated)
- Results: S3 layout `{env}/{source}/{userId}/{catalogId}/{searchId}.json`
  mirrored on the **SQL server via rclone mapped drive**
- Local parts in **MSSQL**; CSV/feed ingest via **`maintainer/`** scheduled task
- Rolling feed-key schedule; change assessment before blind download;
  staging + set-based upsert; scoped deletes
- Every entry / provider / maintainer folder has **AGENTS.md + skillbook** for
  agent CWD isolation
- Caller skillbook **`a-search-endpoint`** for agents that invoke the HTTP API
- All shortlist candidates scaffolded; per-source (and per-env) on/off

## UNKNOWN

- JWT issuer / audience / JWKS / secret **values** (deploy-time) - **key names LOCKED (FR-123)** in [endpoint-search.md](endpoint-search.md); optional JWT `env` claim still UNKNOWN
- rclone drive letter / S3 bucket scheme - **LOCKED (FR-124)**: default `X:` (ops may remap); one dedicated results bucket with `live/`/`sandbox/` prefixes; see [rclone-results.md](rclone-results.md)
- Exact MSSQL table names (`Parts`, `PartFeedKeys`, `PartsStaging`, `ImpactPendingOnboard`) - **resolved (FR-120)**: a-search **owns** these tables (option a); ops apply `maintainer/sql` migrations to **live `madeiradb` and the sandbox DB** (FR-121). Local Awin/Impact workers SELECT `dbo.Parts` (not `dbo.MerchantProducts`). Live inventory remains [data-model.md](data-model.md) (FR-113).
- Sandbox MSSQL isolation - **LOCKED (FR-121)**: separate database on the same instance (not schema-in-madeiradb, not read-only live); sandbox DB **name** still deploy/ops (`MSSQL_DATABASE=<sandbox-mssql-database>`)
- AWS Lambda/Fargate -> IONOS SQL **chosen** path (A fixed egress / B VPN / C on-box) - **decision surface LOCKED (FR-122)** in [environments.md](environments.md); choice still PENDING
- Maintainer cadence defaults (`MAINTAINER_TOP`, interval) beyond proposals
- Grok relevance phase in/out of Phase 0
- AWS account IDs; cutover off `madeira-sqs-affiliate`
