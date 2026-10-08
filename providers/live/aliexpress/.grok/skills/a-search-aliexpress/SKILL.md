---
name: a-search-aliexpress
description: >
  Maintain a-search aliexpress live API provider worker. Use in providers/live/aliexpress.
---

# a-search aliexpress (live)

Registry folder `providers/live/aliexpress`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark — see `docs/phase2-providers.md`).

## Search path (FR-071)

`src/search.js` — injectable `httpRequest`, Affiliate
`aliexpress.affiliate.product.query` with `ALIEXPRESS_API_KEY`, fixture
`fixtures/products-ok.json` (`aliexpressProductAPI.products[]`). Stay-dark.

## Normalize / worker

Normalize (FR-072) and worker wiring (FR-073) are separate.

## Env

See `.env.example`. Queue env: `SQS_ALIEXPRESS_URL`.
