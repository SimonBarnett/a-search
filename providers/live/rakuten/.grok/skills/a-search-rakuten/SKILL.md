---
name: a-search-rakuten
description: >
  Maintain the a-search Rakuten live provider worker: SQS consume, Product
  Search (XML), rate limits, normalize products, S3 results write. Use in
  providers/live/rakuten or /a-search-rakuten. Holds Rakuten secrets only here.
---

# a-search Rakuten (live provider)

> **CAST IRON:** Never commit Rakuten application keys. Keep them in
> `providers/live/rakuten/.env` only.

Registry id `rakuten` (`kind: live`, default-on).

## XML responses

Rakuten Product Search commonly returns **XML**. Parse with a strict XML
parser (not regex). Map item nodes into the shared `products[]` shape
before S3 write. Preserve publisher item ids for dedupe.

## Rate limits

Rakuten enforces **rate limits** per application key. Playbook:

1. Honour `Retry-After` / documented QPS caps.
2. Exponential backoff on 429 / 503 — never tight-loop a single searchId.
3. Prefer one outbound search per SQS message; fan-out already parallelises
   sources, not pages inside this worker unless a later FR says otherwise.
4. Log throttle events without dumping secrets.

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for Rakuten queue | `POST /search` / JWT |
| Product Search client + XML parse | MSSQL maintainer |
| Rate-limit backoff | Other providers' secrets |
| S3 results at canonical key | Registry / fan-out |

## Worker stub

`src/worker.js` exports `run(msg)` — callable until the live client FR.

## Env

See `.env.example`: `A_SEARCH_ENV`, Rakuten key placeholders,
`SQS_RAKUTEN_URL`, `S3_RESULTS_BUCKET`.

## Tests

```bash
npm test
```

FR-018 pins: `tests/rakuten-scaffold.test.js` (paths, XML + rate limit
skill notes, `run()`).
