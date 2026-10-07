---
name: a-search-awin
description: >
  Maintain the a-search Awin local provider worker: SQS consume, SELECT
  MSSQL Parts for awin source, normalize products, S3 results write,
  live vs sandbox. Use in providers/local/awin or /a-search-awin.
  Feed ingest is maintainer; this skill covers search SQL + feed hooks.
---

# a-search Awin (local provider)

> **CAST IRON:** Never commit MSSQL passwords or Awin API tokens. Keep
> them in `providers/local/awin/.env` only.

You are working in **`providers/local/awin/`** — offline worker for
registry id `awin` (`kind: local`, default-on).

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for Awin queue | `POST /search` / JWT |
| SELECT / FTS against `dbo.Parts` where Source=awin | Feed CSV download / MERGE |
| Normalize Parts rows → products[] | Other providers' credentials |
| S3 results write at canonical key | Fan-out / registry edits |
| Awin feed parser hooks (later FRs) | Whole-estate maintainer schedule |

## Search vs ingest

```
maintainer (schedule) → MSSQL Parts
POST /search → SQS local/awin → worker SELECTs Parts → S3 results
```

Ingest is **`maintainer/`** (roll / fetch / upsert / scoped delete). This
worker only **reads** Parts for `Source = N'awin'` and `Env = message.env`,
skipping soft-deleted rows (`DeletedAt IS NULL`).

## Worker (FR-043)

`src/worker.js` exports `run(msg, deps?)`:

1. `assertWorkerEnv` — `message.env` must equal `A_SEARCH_ENV`
2. `defaultQueryParts` (`src/queryParts.js`) — parameterized SELECT on
   `dbo.Parts` (`Source=N'awin'`, `Env=@env`, `DeletedAt IS NULL`, Title /
   Description LIKE from `q` / `searchterms`). Injectable `deps.connect` /
   `deps.queryParts` for fixtures.
3. `normalizePart` — `MerchantProductId` → `id`, `Title` → `title`, etc.
4. `writeResults` — S3 at canonical key (injectable `putObject`)

Missing `MSSQL_SERVER` / `MSSQL_DATABASE` (and user unless trusted) →
`AwinMssqlConfigError` (`awin_mssql_missing_config`) — never silent `[]`.

Message shape matches entry fan-out payload (`searchId`, `userId`, `env`,
`q` / `searchterms`, `catalogId`, `category`, `subcategory`, `source`).

## Env

See `.env.example`: `A_SEARCH_ENV`, MSSQL connection placeholders,
`SQS_AWIN_URL`, `S3_RESULTS_BUCKET`, Awin publisher token placeholders.

## Failures (playbook)

| Symptom | Check |
|---------|--------|
| `awin_mssql_missing_config` | `MSSQL_SERVER` + `MSSQL_DATABASE` (+ user or trusted) |
| Login failed / timeout | MSSQL_SERVER / firewall / creds |
| Empty products | Query too narrow; Parts not ingested for FeedKey |
| env_mismatch | `message.env` !== `A_SEARCH_ENV` |
| Soft-deleted noise | Filter `DeletedAt IS NULL` |

## Tests

```bash
npm test
```

- FR-020: `tests/awin-scaffold.test.js` (paths + mock `queryParts`)
- FR-043: `tests/awin-query-parts.test.js` (mock connect → products +
  writeResults; missing config error; SQL pins)
