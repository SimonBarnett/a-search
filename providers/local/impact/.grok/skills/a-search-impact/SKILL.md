---
name: a-search-impact
description: >
  Maintain the a-search Impact local provider worker: SQS consume, SELECT
  MSSQL Parts for impact source, normalize products, S3 results write,
  live vs sandbox. Use in providers/local/impact or /a-search-impact.
  Feed ingest is maintainer; this skill covers search SQL.
---

# a-search Impact (local provider)

> **CAST IRON:** Never commit MSSQL passwords or Impact feed credentials.
> Keep them in `providers/local/impact/.env` only.

You are working in **`providers/local/impact/`** — offline worker for
registry id `impact` (`kind: local`, default-on).

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for Impact queue | `POST /search` / JWT |
| SELECT against `dbo.Parts` where Source=impact | Feed CSV download / MERGE |
| Normalize Parts rows → products[] | Other providers' credentials |
| S3 results write at canonical key | Fan-out / registry edits |

## Search vs ingest

```
maintainer (schedule) → MSSQL Parts
POST /search → SQS local/impact → worker SELECTs Parts → S3 results
```

Ingest is **`maintainer/`** (roll / fetch / upsert / scoped delete). This
worker only **reads** Parts for `Source = N'impact'` and `Env = message.env`,
skipping soft-deleted rows (`DeletedAt IS NULL`).

## Worker (FR-044)

`src/worker.js` exports `run(msg, deps?)`:

1. `assertWorkerEnv` — `message.env` must equal `A_SEARCH_ENV`
2. `defaultQueryParts` (`src/queryParts.js`) — parameterized SELECT on
   `dbo.Parts` (`Source=N'impact'`, `Env=@env`, `DeletedAt IS NULL`, Title /
   Description LIKE from `q` / `searchterms`). Injectable `deps.connect` /
   `deps.queryParts` for fixtures.
3. `normalizePart` — `MerchantProductId` → `id`, `Title` → `title`, etc.
4. `writeResults` — S3 at canonical key (injectable `putObject`)

Missing `MSSQL_SERVER` / `MSSQL_DATABASE` (and user unless trusted) →
`ImpactMssqlConfigError` (`impact_mssql_missing_config`) — never silent `[]`.

Message shape matches entry fan-out payload (`searchId`, `userId`, `env`,
`q` / `searchterms`, `catalogId`, `category`, `subcategory`, `source`).

## Env

See `.env.example`: `A_SEARCH_ENV`, MSSQL connection placeholders,
`SQS_IMPACT_URL`, `S3_RESULTS_BUCKET`.

## Failures (playbook)

| Symptom | Check |
|---------|--------|
| `impact_mssql_missing_config` | `MSSQL_SERVER` + `MSSQL_DATABASE` (+ user or trusted) |
| Login failed / timeout | MSSQL_SERVER / firewall / creds |
| Empty products | Query too narrow; Parts not ingested for FeedKey |
| env_mismatch | `message.env` !== `A_SEARCH_ENV` |
| Soft-deleted noise | Filter `DeletedAt IS NULL` |

## Tests

```bash
npm test
```

- FR-021: `tests/impact-scaffold.test.js`
- FR-044: `tests/impact-search.test.js` (mock connect → products + writeResults; missing config error; SQL pins)
