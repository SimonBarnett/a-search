---
name: a-search-cj
description: >
  Maintain the a-search CJ live provider worker: SQS consume, GraphQL
  product search at ads.api.cj.com, normalize products, S3 results write.
  Use in providers/live/cj or /a-search-cj. Holds CJ secrets only here.
---

# a-search CJ (live provider)

> **CAST IRON:** Never commit CJ personal access tokens. Keep them in
> `providers/live/cj/.env` only.

Registry id `cj` (`kind: live`, default-on).

## GraphQL endpoint

Product search uses CJ's GraphQL API at **`ads.api.cj.com`** (HTTPS).
Authenticate with the personal access token / developer key from env.
Send GraphQL queries only — do not scrape the publisher UI.

Document request/response shapes in a later client FR; this scaffold
locks the CWD and endpoint name for agents.

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for CJ queue | `POST /search` / JWT |
| GraphQL client → `ads.api.cj.com` | MSSQL maintainer |
| Normalize → products[] | Other providers' secrets |
| S3 results at canonical key | Registry / fan-out |

## Worker stub

`src/worker.js` exports `run(msg)` — callable until the GraphQL client FR.

## Env

See `.env.example`: `A_SEARCH_ENV`, `CJ_API_TOKEN`, `CJ_GRAPHQL_URL`
(default `https://ads.api.cj.com/query`), `SQS_CJ_URL`, `S3_RESULTS_BUCKET`.

## Failures

| Symptom | Check |
|---------|--------|
| 401 | Token revoked / wrong header |
| GraphQL errors[] | Query fields / permissions |
| env_mismatch | `message.env` !== `A_SEARCH_ENV` |

## Tests

```bash
npm test
```

FR-019 pins: `tests/cj-scaffold.test.js` (paths, `ads.api.cj.com`, `run()`).
