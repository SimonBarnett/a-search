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

## Worker (FR-040)

`src/worker.js` exports `run(msg, deps?)`:

1. `assertWorkerEnv` — `message.env` must equal `A_SEARCH_ENV`
2. Require `RAKUTEN_APPLICATION_KEY` (optional `RAKUTEN_AFFILIATE_ID`)
3. Product Search GET (`src/search.js`) → XML parse → `products[]`
4. `writeResults` → `S3_RESULTS_BUCKET` at `{env}/rakuten/{userId}/{catalogId}/{searchId}.json`

Injectable `httpRequest` / `putObject` for fixtures (`fixtures/product-search-ok.xml`).

## XML responses

Rakuten Product Search returns **XML**. Parse with the tag-boundary walker in
`search.js` (`parseProductSearchXml`) — not a whole-document regex. Map item
nodes into the shared `products[]` shape before S3 write. Preserve publisher
item ids for dedupe.

## Rate limits

Rakuten enforces **rate limits** per application key. Playbook:

1. Honour `Retry-After` / documented QPS caps.
2. Exponential backoff on 429 / 503 — never tight-loop a single searchId.
3. Prefer one outbound search per SQS message; fan-out already parallelises
   sources, not pages inside this worker unless a later FR says otherwise.
4. Log throttle events without dumping secrets.
5. Default HTTP helper rejects 429/503 with a clear rate-limit error before parse.

## Responsibilities

| Owns | Does not own |
|------|----------------|
| SQS consume for Rakuten queue | `POST /search` / JWT |
| Product Search client + XML parse | MSSQL maintainer |
| Rate-limit backoff | Other providers' secrets |
| S3 results at canonical key | Registry / fan-out |

## Env

See `.env.example`: `A_SEARCH_ENV`, `RAKUTEN_APPLICATION_KEY`,
`RAKUTEN_AFFILIATE_ID`, `RAKUTEN_ENDPOINT`, `SQS_RAKUTEN_URL`,
`S3_RESULTS_BUCKET`.

Missing application key → `RakutenCredsError` / `rakuten_missing_credentials`.

## Tests

```bash
npm test
```

- FR-018: `tests/rakuten-scaffold.test.js`
- FR-040: `tests/rakuten-search.test.js`
