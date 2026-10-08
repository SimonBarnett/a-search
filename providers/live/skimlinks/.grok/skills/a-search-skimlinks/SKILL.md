---
name: a-search-skimlinks
description: >
  Maintain a-search skimlinks live API provider worker. Use in providers/live/skimlinks.
---

# a-search skimlinks (live)

Registry folder `providers/live/skimlinks`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark — see `docs/phase2-providers.md`).

## Search path (FR-067)

`src/search.js` lands in FR-067. Recorded normalize fixture:
`fixtures/products-ok.json`.

## Normalize (FR-068)

`src/normalize.js` maps product-search JSON → `worker/lib/normalizeProduct`:

| Skimlinks field | Product field |
|-----------------|---------------|
| `id` / `product_id` | `id` |
| `title` / `name` | `title` |
| `url` / `deep_link` / `click_url` | `url` via `buildTrackedUrl` + `SKIMLINKS_PUBLISHER_ID` |
| `image` / `image_url` | `imageUrl` |
| `price` / `currency` | `price` / `currency` |
| `merchant` / `merchant_name` | `description` (optional) |

Partial rows without id+title are skipped (no throw).

## Worker stub

`src/worker.js` exports `run(msg)` — FR-069 wiring is separate.

## Env

See `.env.example`. Queue env: `SQS_SKIMLINKS_URL`.
