---
name: a-search-etsy
description: >
  Maintain a-search etsy live API provider worker. Use in providers/live/etsy.
---

# a-search etsy (live)

Registry folder `providers/live/etsy`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).

## Env

See `.env.example`. Queue env: `SQS_ETSY_URL`. Creds: `ETSY_API_KEY` (or `ETSY_KEYSTRING`). Tracking: `ETSY_TRACKING_ID`.

## Search path (FR-075)

`src/search.js` -- injectable `httpRequest`, Open API v3 `GET /application/listings/active`
with `x-api-key` / `ETSY_API_KEY`, fixture `fixtures/listings-ok.json`
(`etsyProductAPI.results[]`). Stay-dark.

## Normalize (FR-076)

`src/normalize.js` maps Open API listing JSON to `worker/lib/normalizeProduct`:

| Etsy field | Product field |
|------------|---------------|
| `listing_id` | `id` |
| `title` | `title` |
| `url` | `url` via `buildTrackedUrl` + `ETSY_TRACKING_ID` |
| `images[0].url_570xN` | `imageUrl` |
| `price.amount` / `price.divisor` | `price` (major units) |
| `price.currency_code` | `currency` |
| `description` | `description` |

Accepts `etsyProductAPI.results[]` (FR-075 fixture) and top-level `results[]`.
Partial rows without id+title are skipped (no throw). Stay-dark.

## Worker (FR-077)

`src/worker.js` `run(msg, deps)` -- `assertWorkerEnv` -> `assertEtsyCreds` -> `searchEtsy` -> `normalizeSearchResponse` -> `writeResults`. Injectable `httpRequest` / `putObject` / search / normalize. Optional `handler` for SQS Records. Stay-dark.

## Selftest + rateLimit (FR-078)

`src/selftestProbe.js` -- credential check + recorded fixture (or injectable HTTP). Registry `rateLimit.maxConcurrency` / `minIntervalMs`. Stay-dark.
