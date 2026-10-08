# Functional spec (LOCKED pulls from vision)

## Product
`a-search` — Node on AWS. Single `POST /search` entry + offline workers +
scheduled local-parts maintainer.

## Auth
- `Authorization: Bearer <jwt>` from login
- Claim `userId` = search principal → SQS + results path
- Body must not override user identity

## Environments
- **live** and **sandbox** only
- Body `sandbox: true` selects sandbox; default live
- Separate queues, SQL, and result prefixes; see `docs/environments.md`

## Accept contract
- Valid JWT + body → **HTTP 200** with `searchId`, `accepted`, `userId`, `env`, `enqueued`
- Offline SQS processing; no products in the HTTP response
- 400 validation / 401 auth → no enqueue

## Results
- S3 key: `{env}/{source}/{userId}/{catalogId}/{searchId}.json`
- Same tree on SQL server via **rclone mapped drive**

## Local parts
- MSSQL holds parts from Awin-class CSV/feeds
- `maintainer/` scheduled AWS task: rolling feed keys, conditional download,
  staging MERGE upserts, scoped deletes — `docs/parts-maintainer.md`

## Skillbooks
- Each `entry/`, `maintainer/`, `providers/**/<id>/` folder is an agent CWD
  with `AGENTS.md` + `.grok/skills/a-search-<id>/SKILL.md`
- Agents **calling** the API use `.grok/skills/a-search-endpoint/SKILL.md`
- `docs/skillbook-layout.md`

## Providers
`docs/provider-shortlist.md` — all candidates scaffolded; per-source / per-env on/off.

## Endpoint
- Search: `docs/endpoint-search.md`
- Performance: `docs/endpoint-performance.md` (Phase 1b)

## Phase 1b (LOCKED)

Ops agents + performance + mapping (vision Success S10-S16 / plan-20261007-142747):

- **Harvest CAST IRON** in every agent CWD (`AGENTS.md` + `a-search-*` SKILL.md): file via bobiverse intake `POST /bob/v1/intake` with explicit `-Repo SimonBarnett/a-search` (see `tests/skillbook-harvest.test.js`).
- **Shared layer only** for shared helpers: `resultsPath`, `writeResults`, `assertEnv`, intake reporter, mapping, signup helpers live under `shared/` (Lambda layer `/opt/nodejs/a-search`); providers do not copy-paste (`docs/shared-layer.md`).
- **Deterministic exceptions -> a-search intake**: entry/worker/maintainer/onboarding fatal paths call intake with `repo=SimonBarnett/a-search` (deduped, secrets redacted) — `docs/intake-on-exception.md`.
- **Local onboarding agents**: each enabled local source has `onboarding/` agent CWD + scheduled drain until `remaining=0` then exit — `docs/onboarding-agents.md`.
- **Daily report signup feed**: onboarding emits clubscan-parity signup rows under `{env}/_reports/{source}/{day}/signups.json` — `docs/daily-report-signups.md`.
- **Performance endpoint**: JWT `GET`/`POST` `/account/performance` returns clicks/visits/sales for that JWT `userId` only (body cannot override) — `docs/endpoint-performance.md`.
- **Durable S3 mapping**: upsert/get/list mapping records (token/link -> S3 key) under `{env}/_mapping/`; never memory-only — `docs/s3-mapping.md`.
