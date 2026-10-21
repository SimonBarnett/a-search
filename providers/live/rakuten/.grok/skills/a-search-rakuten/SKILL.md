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

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry id `rakuten` (`kind: live`, default-on).

## Worker (FR-040)

`src/worker.js` exports `run(msg, deps?)`:

1. `assertWorkerEnv` --- `message.env` must equal `A_SEARCH_ENV`
2. Require `RAKUTEN_CLIENT_ID`, `RAKUTEN_CLIENT_SECRET`, and `RAKUTEN_SID`
3. Product Search GET (`src/search.js`) → XML parse → `products[]`
4. `writeResults` → `S3_RESULTS_BUCKET` at `{env}/rakuten/{userId}/{catalogId}/{searchId}.json`

Injectable `httpRequest` / `putObject` for fixtures (`fixtures/product-search-ok.xml`).

## XML responses

Rakuten Product Search returns **XML**. Parse with the tag-boundary walker in
`search.js` (`parseProductSearchXml`) --- not a whole-document regex. Map item
nodes into the shared `products[]` shape before S3 write. Preserve publisher
item ids for dedupe.

## Rate limits

Rakuten enforces **rate limits** per application key. Playbook:

1. Honour `Retry-After` / documented QPS caps.
2. Exponential backoff on 429 / 503 --- never tight-loop a single searchId.
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

See `.env.example`: `A_SEARCH_ENV`, `RAKUTEN_CLIENT_ID`,
`RAKUTEN_CLIENT_SECRET`, `RAKUTEN_SID`, `RAKUTEN_ENDPOINT`,
`RAKUTEN_LANGUAGE` (default `en_US`), `SQS_RAKUTEN_URL`, `S3_RESULTS_BUCKET`.

Missing application key → `RakutenCredsError` / `rakuten_missing_credentials`.

**FR #4544 / #4769 / #4781:** Product Search rejects Lucene-style `-exclude`
inside `keyword` (`INVALID_CONTEXT_VALUE`). Do **not** send the Linksynergy
`none` query param --- long worker-built `none` strings return the whole
advertiser catalogue (FR #4781). Apply agent excludes client-side on product
title. On INVALID_CONTEXT_VALUE fail into the Rakuten DLQ (no status IN / no
intake).

## Tests

```bash
npm test
```

- FR-018: `tests/rakuten-scaffold.test.js`
- FR-040: `tests/rakuten-search.test.js`
- FR #4781: `tests/fr4781-rakuten-drop-none-client-exclude.test.js`

## Product Search keywords (FR #4768 / #4780 / #4781)

- One Product Search HTTP call per agent query (eBay #4446 pattern); merge/dedupe; respect maxResults (default 10).
- Sanitize keyword tokens: replace hyphens and Linksynergy-rejected punctuation `( ) , ; .` with spaces (never send raw `a-b` / `761-14` --- INVALID_CONTEXT_VALUE).
- Strip market/location/currency residue via `keywordsOnly` (FR #4563) before each Product Search call --- parenthetical towns/postcodes and GBP/UK must not ride in `keyword`.
- Never send `none` (FR #4781: long `none` returns the whole catalogue); keep full exclude phrases (len>=3) and filter matching titles locally.
- On INVALID_CONTEXT_VALUE throw `rakuten_invalid_context` into the DLQ (FR #4769; not a silent empty products list or status IN).
