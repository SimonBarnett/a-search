---
name: a-search-bol
description: >
  Maintain a-search bol live API provider worker. Use in providers/live/bol.
---

# a-search bol (live)

Registry folder `providers/live/bol`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).

## Env

See `.env.example`. Queue env: `SQS_BOL_URL`. Creds: `BOL_API_KEY` (or `BOL_CLIENT_ID`). Tracking: `BOL_TRACKING_ID`.

## Search path (FR-079)

`src/search.js` -- injectable `httpRequest`, GET `{BOL_API_BASE}/catalog/v4/search`
with `X-API-KEY` / `BOL_API_KEY`, fixture `fixtures/products-ok.json`
(`bolProductAPI.products[]`). Stay-dark.

## Normalize (FR-080)

`src/normalize.js` maps catalog JSON to `worker/lib/normalizeProduct`:

| Bol field | Product field |
|-----------|---------------|
| `id` / `ean` | `id` |
| `title` | `title` |
| `url` | `url` via `buildTrackedUrl` + `BOL_TRACKING_ID` |
| `imageUrl` | `imageUrl` |
| `offerPrice` | `price` |
| `currency` | `currency` |
| `seller` | `description` |

Accepts `bolProductAPI.products[]` (FR-079 fixture) and top-level `products[]`.
Partial rows without id+title are skipped (no throw). Stay-dark.

## Worker (FR-081)

`src/worker.js` `run(msg, deps)` -- `assertWorkerEnv` -> `assertBolCreds` -> `searchBol` -> `normalizeSearchResponse` -> `writeResults`. Injectable `httpRequest` / `putObject` / search / normalize. Optional `handler` for SQS Records. Stay-dark.

## Selftest + pacing (FR-082)

`src/selftestProbe.js` -- credential check + fixture (or injectable HTTP);
returns `{ ok, source, latencyMs, error? }` for `/selftest`.
Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250` (CDK ESM wiring
is a later FR while stay-dark).
