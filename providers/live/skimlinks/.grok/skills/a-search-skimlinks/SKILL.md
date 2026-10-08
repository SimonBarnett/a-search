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

## Normalize (FR-068/069)

`src/normalize.js` maps Product API products → `normalizeProduct`:

| Skimlinks field | Product field |
|-----------------|---------------|
| `id` | `id` |
| `title` | `title` |
| `url` | tracked `url` via `buildTrackedUrl` + `SKIMLINKS_PUBLISHER_ID` |
| `image_url` | `imageUrl` |
| `price` (minor units, e.g. 89900) | `price` (/100) |
| `currency` | `currency` |
| `merchant` | `description` |

## Worker (FR-069)

`src/worker.js` — `assertWorkerEnv` → `searchSkimlinks` → `normalizeSearchResponse`
→ `writeResults` (injectable HTTP + putObject).

## Selftest + pacing (FR-070)

`src/selftestProbe.js` — credential check + fixture (or injectable HTTP);
returns `{ ok, source, latencyMs, error? }` for `/selftest`.
Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250` (CDK ESM wiring
is a later FR while stay-dark).

## Env

See `.env.example`. Queue env: `SQS_SKIMLINKS_URL`.
