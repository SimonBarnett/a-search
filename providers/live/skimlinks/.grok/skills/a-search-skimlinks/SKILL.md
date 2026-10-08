---
name: a-search-skimlinks
description: >
  Maintain a-search skimlinks live API provider worker. Use in providers/live/skimlinks.
---

# a-search skimlinks (live)

Registry folder `providers/live/skimlinks`. Enabled: live=false, sandbox=false.

## Search path

Live skimlinks API client lands in a later FR.

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_SKIMLINKS_URL`.
## Search path (FR-067)

`src/search.js` — injectable `httpRequest`, Product API `/product/query` with `SKIMLINKS_API_KEY`, fixture `fixtures/products-ok.json`. Stay-dark.
