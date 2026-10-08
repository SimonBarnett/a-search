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
MRB: keep, reword or trim; twins are listed once with every source.

- When Phase-2 normalize MRB races merged search fixture (add/add products-ok.json), keep search ProductAPI shape, add productsFromBody branch, retain normalize-only fields like shop_name, then merge (bobiverse#3360; context: MRB a-search#705 PASS FR-072 aliexpress normalize; keep-both ProductAPI fixture after #703; merged; #625 closed)
- Phase-2 worker MRB after normalize: merge main, keep-both fixture enrichments (shop_name), replace skill placeholder Worker-separate with real FR-073 wiring note, hostile pin stay-dark (bobiverse#3363; context: MRB a-search#710 PASS FR-073 aliexpress worker search->normalize->writeResults stay-dark; keep-both shop_name; merged; #626 closed)
- Phase-2 selftest MRB: pin rateLimit maxConcurrency/minIntervalMs + stay-dark; clean skill mojibake on FR-074 Selftest section; fixtureLooksOk must accept aliexpressProductAPI.products (bobiverse#3365; context: MRB a-search#712 PASS FR-074 aliexpress selftestProbe+rateLimit stay-dark; skill ASCII; merged; #627 closed)
- a-search Phase-2 selftest MRB: merge behind-main worker tip first, then docs/mrb-N from new origin/main with peer etsy/aliexpress skill pacing parity (Selftest + pacing + maxConcurrency:1 / minIntervalMs:250) and bol_fixture_invalid hostile pin (bobiverse#3398, bobiverse#3399; context: MRB a-search#723 FR-082 bol selftestProbe+rateLimit PASS; merged #723 + docs/mrb #724 hostile pins; #635 closed)
