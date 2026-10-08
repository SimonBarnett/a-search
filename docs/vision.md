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
scheduled maintainer keeps local parts fresh from CSV/feeds — with live and
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
| S5 | JWT user id drives search + results path | Bearer JWT `userId` required; copied to SQS and result keys; body cannot override | `tests/auth-jwt.test.js` | Accept without JWT or path user id ≠ claim |
| S6 | Live/sandbox isolation | live and sandbox use separate queue names, SQL targets, and result path prefixes; worker refuses wrong-env messages | `tests/env-isolation-runtime.test.js` asserts cross-env enqueue/write blocked | Sandbox job writes live path or live SQL |
| S7 | Rolling parts maintainer | Scheduled task refreshes only due feed keys from MSSQL; conditional download before blind pull; set-based upsert + scoped delete | `tests/maintainer-roll.test.js` (fixture keys, 304/hash skip, MERGE staging) | Full-estate blind download every tick, or row-by-row upserts only |
| S8 | Per-folder skillbooks | Each entry/provider/maintainer folder has `AGENTS.md` + `.grok/skills/a-search-<id>/SKILL.md` so an agent CWD there can maintain that integration alone | Repo layout test / checklist `docs/skillbook-layout.md` counts required files | Amazon agent must load awin skill to debug amazon |
| S9 | Caller endpoint skillbook | Product ships `.grok/skills/a-search-endpoint/SKILL.md` so an agent can call `POST /search` with JWT, env, and result-path playbook | File present in repo; fixture agent checklist in `docs/skillbook-layout.md` | Callers only have HTTP docs with no agent skill |
| S10 | Harvest CAST IRON in every agent CWD | Every `AGENTS.md` + `a-search-*` SKILL.md contains the CAST IRON harvest block and intake `POST /bob/v1/intake` with explicit `-Repo SimonBarnett/a-search` | `tests/skillbook-harvest.test.js` enumerates entry/maintainer/providers/endpoint and asserts CAST IRON + intake + `-Repo` needles | Any required agent CWD missing the harvest block |
| S11 | Shared layer only for shared code | `resultsPath`, `writeResults`, `assertEnv`, intake reporter, and related helpers live under `shared/` (Lambda layer `/opt/nodejs/a-search`); providers do not copy-paste those helpers | `tests/shared-no-dup.test.js` + FR-047 shared-package / resultsPath / writeResults pin tests; `docs/shared-layer.md` | Duplicate shared helpers reappear under `providers/*/src` |

LOCKED

## Shape

Primary (one): **service**

Hybrid note: HTTP search API + SQS workers + scheduled parts maintainer are
the product. HTML mocks document gateway accept/empty/error. Club Madeira UI
stays outside this repo.

LOCKED

## Stack

Default: **Node.js 20+ on AWS** — API Gateway → entry Lambda; per-source SQS
→ workers; EventBridge → maintainer task; **MSSQL** for local parts + feed
keys; results in **S3** exposed on the SQL server as an **rclone mapped
drive**; per-folder `.env` / Secrets Manager; **live** and **sandbox**
isolated.

Why: Matches Madeira Node connectors, keeps credentials isolated, keeps
parts searchable locally, and lets the SQL host consume results via familiar
paths without inventing a second store.

Why-not:
- Single shared Lambda + shared env (legacy affiliate) — blast radius / secrets.
- Sync multi-HTTP from entry — latency and rate-limit coupling.
- Local parts only in OpenSearch/files — MSSQL is the LOCKED parts store.
- Results only as abstract S3 with no SQL-host mount — ops need rclone drive
  on the SQL server.

LOCKED

## Architecture

```
Caller (login → JWT)
        |
        v
  API Gateway  POST /search   [live | sandbox]
  Authorization: Bearer <jwt>
        |
        v
  entry/  (entry/.env + a-search-entry skillbook)
    - verify JWT → userId
    - stamp env = live|sandbox
    - fan-out SQS per enabled source for that env
    - 200 { searchId, accepted, userId, enqueued, env }
        |
        +------------ live|sandbox queues ------------+
        v                                             v
 providers/live/*                              providers/local/*
  SQS search workers                            SQS search workers
  (remote APIs)                                 (SELECT MSSQL Parts)
        |                                             |
        +------------------+--------------------------+
                           v
         Results → S3 key:
           {env}/{source}/{userId}/{catalogId}/{searchId}.json
         SQL server: rclone mapped drive mirrors same tree
           e.g. S:\a-search\{env}\{source}\{userId}\...

  maintainer/  (EventBridge schedule, maintainer/.env)
    - roll due PartFeedKeys from MSSQL (per env DB/schema)
    - conditional GET / hash before full CSV download
    - staging bulk + MERGE upsert; scoped delete missing parts
    - feed parsers/creds delegated to providers/local/<id>/
```

Folder layout (repo root):

```
entry/
  AGENTS.md
  .grok/skills/a-search-entry/SKILL.md
  .env.example
  src/
maintainer/                      # scheduled AWS task — local parts estate
  AGENTS.md
  .grok/skills/a-search-maintainer/SKILL.md
  .env.example
  src/
providers/
  registry.json                  # id, kind, enabled per live/sandbox
  live/
    amazon/   ebay/  rakuten/  cj/  ...   # each: .env, AGENTS.md, skillbook, src
  local/
    awin/  impact/  partnerize/ ...       # each: feed+search skillbook, .env, src
.grok/skills/
  a-search-endpoint/SKILL.md   # agent callers of POST /search
docs/
  vision.md
  endpoint-search.md
  environments.md
  parts-maintainer.md
  skillbook-layout.md
  provider-shortlist.md
  mocks/
tests/
```

Detail docs: `docs/endpoint-search.md`, `docs/environments.md`,
`docs/parts-maintainer.md`, `docs/skillbook-layout.md`,
`docs/provider-shortlist.md`.

LOCKED

## Screens

| id | file | state |
|----|------|-------|
| M1 | docs/mocks/home.html | primary — JWT accept + fan-out + env |
| M2 | docs/mocks/empty.html | empty — no providers enabled for env |
| M3 | docs/mocks/error.html | error — 401 JWT / 400 validation |

## LOCKED

- Repo: `SimonBarnett/a-search`; shape **service**; Node on AWS
- `POST /search` → **200** accept; offline SQS fan-out
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

- JWT issuer, audience, JWKS / secret; optional JWT `env` claim
- Exact rclone drive letter and mount unit name on the SQL host
- One S3 bucket with `live/`/`sandbox/` prefixes vs two buckets
- Exact MSSQL table names (`Parts`, `PartFeedKeys`, …)
- Maintainer cadence defaults (`MAINTAINER_TOP`, interval) beyond proposals
- Grok relevance phase in/out of Phase 0
- AWS account IDs; cutover off `madeira-sqs-affiliate`
