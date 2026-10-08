---
name: a-search-aliexpress
description: >
  Maintain a-search aliexpress live API provider worker. Use in providers/live/aliexpress.
---

# a-search aliexpress (live)

Registry folder `providers/live/aliexpress`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).

## Search path (FR-071)

`src/search.js` -- injectable `httpRequest`, Affiliate
`aliexpress.affiliate.product.query` with `ALIEXPRESS_API_KEY`, fixture
`fixtures/products-ok.json` (`aliexpressProductAPI.products[]`). Stay-dark.

## Normalize (FR-072)

`src/normalize.js` maps affiliate product JSON to `worker/lib/normalizeProduct`:

| AliExpress field | Product field |
|------------------|---------------|
| `product_id` / `id` | `id` |
| `product_title` / `title` | `title` |
| `promotion_link` / `product_detail_url` | `url` via `buildTrackedUrl` + `ALIEXPRESS_TRACKING_ID` |
| `product_main_image_url` | `imageUrl` |
| `target_sale_price` / `currency` | `price` / `currency` (major units) |
| `shop_name` | `description` |

Accepts `aliexpressProductAPI.products[]` (recorded search fixture), `result.products[]`,
and common response wrappers. Partial rows without id+title are skipped (no throw). Stay-dark.

## Worker

Worker wiring (FR-073) is separate.

## Env

See `.env.example`. Queue env: `SQS_ALIEXPRESS_URL`.
