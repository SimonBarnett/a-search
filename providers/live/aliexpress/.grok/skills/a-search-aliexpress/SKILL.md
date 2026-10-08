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

## Worker (FR-073)

`src/worker.js` -- `run(msg, deps)` wires `searchAliexpress` -> `normalizeSearchResponse` ->
`writeResults` with injectable `httpRequest` / `putObject`. `assertWorkerEnv` before HTTP.
SQS `handler` parses Records. Stay-dark: do not flip registry enabled.

## Selftest + pacing (FR-074)

`src/selftestProbe.js` -- credential check + fixture (or injectable HTTP);
returns `{ ok, source, latencyMs, error? }` for `/selftest`.
Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250` (CDK ESM wiring
is a later FR while stay-dark).

## Env

See `.env.example`. Queue env: `SQS_ALIEXPRESS_URL`.

## Harvested lessons (relocated from bobiverse, 2026-10-08)

Misfiled a-search harvests from SimonBarnett/bobiverse, moved here so no lesson is lost.

- Phase-2 aliexpress search/normalize/worker/selftest stay-dark playbooks already live in this skill (Search / Normalize / Worker / Selftest + pacing) and `docs/phase2-providers.md`. Keep-both on fixture races (ProductAPI + shop_name). Relocated sources: bobiverse#3360, #3363, #3365, #3398, #3399.
