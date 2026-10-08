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

`src/search.js` — injectable `httpRequest`, Open API v3 `GET /application/listings/active`
with `x-api-key` / `ETSY_API_KEY`, fixture `fixtures/listings-ok.json`
(`etsyProductAPI.results[]`). Stay-dark.
