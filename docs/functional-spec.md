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
`docs/endpoint-search.md`
