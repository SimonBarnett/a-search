---
name: a-search-skimlinks
description: >
  Maintain a-search skimlinks live API provider worker. Use in providers/live/skimlinks.
---

# a-search skimlinks (live)

Registry folder `providers/live/skimlinks`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark — see `docs/phase2-providers.md`).

## Search path (FR-067)

`src/search.js` — injectable `httpRequest`, Product API `/product/query` with
`SKIMLINKS_API_KEY`, fixture `fixtures/products-ok.json`
(`skimlinksProductAPI.products[]`). Stay-dark.

## Normalize / worker

Normalize (FR-068) and worker wiring (FR-069) are separate. Prefer adapting
normalize to this recorded Product API shape when both land.

## Env

See `.env.example`. Queue env: `SQS_SKIMLINKS_URL`.
