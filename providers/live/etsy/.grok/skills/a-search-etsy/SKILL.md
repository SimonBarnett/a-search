---
name: a-search-etsy
description: >
  Maintain a-search etsy live API provider worker. Use in providers/live/etsy.
---

# a-search etsy (live)

Registry folder `providers/live/etsy`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).

## Search path (FR-075)

`src/search.js` -- injectable `httpRequest`, Open API v3 `GET /application/listings/active`
with `x-api-key` / `ETSY_API_KEY`, fixture `fixtures/listings-ok.json`
(`etsyProductAPI.results[]`). Stay-dark.

## Normalize (FR-076)

`src/normalize.js` maps Open API listing JSON to `worker/lib/normalizeProduct`:

| Etsy field | Product field |
|------------|---------------|
| `listing_id` / `id` | `id` |
| `title` | `title` |
| `url` / `url_full` | `url` via `buildTrackedUrl` + `ETSY_TRACKING_ID` |
| `images[0].url_570xN` | `imageUrl` |
| `price.amount` / `price.divisor` | `price` (major units) |
| `price.currency_code` | `currency` |
| `description` / `shop_name` | `description` |

Accepts `etsyProductAPI.results[]` (FR-075 fixture) and top-level `results[]`.
Partial rows without id+title are skipped (no throw). Stay-dark.

## Worker (FR-077)

`src/worker.js` -- `run(msg, deps)` wires `assertWorkerEnv` -> `assertEtsyCreds` ->
`searchEtsy` -> `normalizeSearchResponse` -> `writeResults` with injectable
`httpRequest` / `putObject`. SQS `handler` parses Records. Stay-dark: do not flip
registry enabled.

## Selftest + pacing (FR-078)

`src/selftestProbe.js` -- credential check + fixture (or injectable HTTP);
returns `{ ok, source, latencyMs, error? }` for `/selftest`.
Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250` (CDK ESM wiring
is a later FR while stay-dark).

## Env

See `.env.example`. Queue env: `SQS_ETSY_URL`. Creds: `ETSY_API_KEY` (or
`ETSY_KEYSTRING`). Tracking: `ETSY_TRACKING_ID`.

## Harvested lessons (relocated from bobiverse, 2026-10-08)

Misfiled a-search harvests from SimonBarnett/bobiverse, moved here so no lesson is lost.

- Phase-2 etsy stay-dark stack (search -> normalize -> worker -> selftest): already CAST IRON in this skill + `docs/phase2-providers.md`. Stack tips with Closes+Refs and keep-both comments. Relocated sources: bobiverse#3366, #3368, #3370, #3371, #3373, #3374, #3376, #3377.
