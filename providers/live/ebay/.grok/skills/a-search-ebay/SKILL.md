---
name: a-search-ebay
description: >
  Maintain the a-search eBay live provider worker: SQS consume, Browse API
  search, normalize products, S3 results write, live vs sandbox. Use in
  providers/live/ebay or /a-search-ebay. Holds eBay secrets only here.
---

# a-search eBay (live provider)

> **CAST IRON:** Never commit eBay client secrets or refresh tokens.
> Keep them in `providers/live/ebay/.env` only.

Registry id `ebay` (`kind: live`, default-on).

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for eBay queue | `POST /search` / JWT |
| eBay Browse API client | MSSQL maintainer |
| Normalize → products[] | Other providers' secrets |
| S3 results at canonical key | Registry / fan-out |

## Worker stub

`src/worker.js` exports `run(msg)` — callable scaffold until the Browse
API client FR lands.

## Env

See `.env.example`: `A_SEARCH_ENV`, eBay OAuth placeholders,
`SQS_EBAY_URL`, `S3_RESULTS_BUCKET`.

## Failures

| Symptom | Check |
|---------|--------|
| 401 | OAuth token expired / client id |
| 429 | Backoff |
| env_mismatch | `message.env` !== `A_SEARCH_ENV` |

## Tests

```bash
npm test
```

FR-017 pins: `tests/ebay-scaffold.test.js`.
