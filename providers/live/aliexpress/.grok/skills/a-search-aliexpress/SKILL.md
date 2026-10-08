---
name: a-search-aliexpress
description: >
  Maintain a-search aliexpress live API provider worker. Use in providers/live/aliexpress.
---

# a-search aliexpress (live)

Registry folder `providers/live/aliexpress`. Enabled: live=false, sandbox=false.

## Search path

Live aliexpress API client lands in a later FR.

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_ALIEXPRESS_URL`.
## Normalize (FR-072)

`src/normalize.js` maps affiliate product JSON → `worker/lib/normalizeProduct`:

| AliExpress field | Product field |
|------------------|---------------|
| `product_id` / `id` | `id` |
| `product_title` / `title` | `title` |
| `promotion_link` / `product_detail_url` | `url` via `buildTrackedUrl` + `ALIEXPRESS_TRACKING_ID` |
| `product_main_image_url` | `imageUrl` |
| `target_sale_price` / `currency` | `price` / `currency` (major units) |
| `shop_name` | `description` |

Accepts `result.products[]` (recorded fixture) and common response wrappers.
Partial rows without id+title are skipped (no throw). Stay-dark.
