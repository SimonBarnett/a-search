---
name: a-search-etsy
description: >
  Maintain a-search etsy live API provider worker. Use in providers/live/etsy.
---

# a-search etsy (live)

Registry folder `providers/live/etsy`. Enabled: live=false, sandbox=false.

## Search path

Live etsy API client lands in a later FR.

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_ETSY_URL`.
## Search path (FR-075)

`src/search.js` â€” injectable `httpRequest`, Open API v3 `GET /application/listings/active`
with `x-api-key` / `ETSY_API_KEY`, fixture `fixtures/listings-ok.json`
(`etsyProductAPI.results[]`). Stay-dark.
## Normalize (FR-076)

`src/normalize.js` maps Open API listing JSON → `worker/lib/normalizeProduct`:

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
