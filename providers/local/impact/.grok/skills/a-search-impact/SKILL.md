---
name: a-search-impact
description: >
  Maintain the a-search Impact local provider worker: SQS consume, MSSQL
  Parts SELECT search, normalize products, S3 results write. Use in
  providers/local/impact or /a-search-impact. Does not run the maintainer.
---

# a-search Impact (local / MSSQL parts)

> **CAST IRON:** Never commit MSSQL passwords. Feed download/MERGE lives
> in `maintainer/` — this worker only **reads** `dbo.Parts`.

Registry id `impact` (`kind: local`, default-on).

## MSSQL search

At request time:

1. Assert `message.env` === `A_SEARCH_ENV`.
2. Query `dbo.Parts` for `Source = 'impact'` AND `Env = @env` AND
   `DeletedAt IS NULL`, matching `q` / `searchterms` (and category filters
   when columns exist).
3. Map rows → `products[]`.
4. Write results via shared `writeResults` / results path helpers.

Do **not** call Impact HTTP feeds from this worker.

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for Impact queue | Feed download / MERGE |
| MSSQL Parts SELECT | `POST /search` / JWT |
| S3 results at canonical key | Other sources' data |

## Worker stub

`src/worker.js` exports `run(msg)` — callable until the live SELECT FR.

## Env

See `.env.example`: `A_SEARCH_ENV`, MSSQL placeholders, `SQS_IMPACT_URL`,
`S3_RESULTS_BUCKET`.

## Tests

```bash
npm test
```

FR-021 pins: `tests/impact-scaffold.test.js`.
