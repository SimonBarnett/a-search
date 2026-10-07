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

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry id `cj` (`kind: live`, default-on).

## Worker (FR-041)

`src/worker.js` exports `run(msg, deps?)`:

1. `assertWorkerEnv` — `message.env` must equal `A_SEARCH_ENV`
2. Require `CJ_API_TOKEN` (optional `CJ_COMPANY_ID`)
3. GraphQL POST to `CJ_GRAPHQL_URL` (`src/search.js`); injectable `httpRequest`
4. Normalize `data.products.resultList` → `products[]`
5. `writeResults` → `S3_RESULTS_BUCKET` at `{env}/cj/{userId}/{catalogId}/{searchId}.json`

Fixture: `fixtures/products-ok.json` (`tests/cj-search.test.js`).

## GraphQL endpoint

Product search uses CJ's GraphQL API at **`ads.api.cj.com`** (HTTPS default
`https://ads.api.cj.com/query`). Authenticate with `Authorization: Bearer`
using `CJ_API_TOKEN`. Send GraphQL queries only — do not scrape the publisher UI.

## Env

See `.env.example`: `A_SEARCH_ENV`, `CJ_API_TOKEN`, `CJ_GRAPHQL_URL`,
optional `CJ_COMPANY_ID`, `SQS_CJ_URL`, `S3_RESULTS_BUCKET`.

Missing token → `CjCredsError` / `cj_missing_credentials`.

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

- FR-019: `tests/cj-scaffold.test.js`
- FR-041: `tests/cj-search.test.js`
