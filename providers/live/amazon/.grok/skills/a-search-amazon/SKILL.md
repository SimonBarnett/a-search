---
name: a-search-amazon
description: >
  Maintain the a-search Amazon live provider worker: SQS consume, PA-API
  search, normalize products, S3 results write, live vs sandbox. Use in
  providers/live/amazon or /a-search-amazon. Holds Amazon secrets only here.
---

# a-search Amazon (live provider)

> **CAST IRON:** Never commit `AWS_ACCESS_KEY` / PA-API secrets / partner
> tags. Keep them in `providers/live/amazon/.env` only.

You are working in **`providers/live/amazon/`** — offline worker for
registry id `amazon` (`kind: live`, default-on).

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for Amazon queue | `POST /search` / JWT |
| Amazon search API client (FR-030) | MSSQL parts maintainer |
| Normalize → products[] | Other providers' credentials |
| S3 results write at canonical key | Fan-out / registry edits |

## Worker stub

`src/worker.js` exports `run(msg)` — callable scaffold until FR-030.
Message shape matches entry fan-out payload (`searchId`, `userId`, `env`,
`q` / `searchterms`, `catalogId`, `category`, `subcategory`, `source`).

## Env

See `.env.example`: `A_SEARCH_ENV`, Amazon credential placeholders,
`SQS_AMAZON_URL`, `S3_RESULTS_BUCKET`.

## Failures (playbook)

| Symptom | Check |
|---------|--------|
| 401/403 from Amazon | Keys / partner tag / host |
| 429 | Backoff; do not tight-loop |
| env_mismatch | `message.env` !== `A_SEARCH_ENV` |
| Empty products | Query too narrow; still write stub JSON |

## Tests

```bash
npm test
```

FR-016 pins: `tests/amazon-scaffold.test.js` (paths + `run(msg)` callable).
