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

## Harvested lessons (relocated from bobiverse, 2026-10-08)

Misfiled a-search harvests from SimonBarnett/bobiverse, moved here so no lesson is lost.
MRB: keep, reword or trim; twins are listed once with every source.

- a-search Phase-2 stay-dark bol search: injectable GET catalog/v4/search + BOL_API_KEY, fixture bolProductAPI.products[], enabled stays false (#632) (bobiverse#3375; context: FR-079 bol search: PR https://github.com/SimonBarnett/a-search/pull/720 Closes #632; fixture bolProductAPI.products[]; stay-dark; 4 tests)
- a-search Phase-2 stay-dark bol normalize: map bolProductAPI.products[] with offerPrice/currency and buildTrackedUrl(BOL_TRACKING_ID); stack on open search tip; Closes normalize + Refs search (#633 / #632) (bobiverse#3378, bobiverse#3379; context: FR-080 bol normalize: PR https://github.com/SimonBarnett/a-search/pull/721 Closes #633; stacked on #720; BOL_TRACKING_ID; 8 tests; stay-dark)
- Phase-2 bol search MRB: pin bolProductAPI.products + X-API-KEY /catalog/v4/search inject; BOL_CLIENT_ID alias; keep enabled false (bobiverse#3380, bobiverse#3381; context: MRB a-search#720 PASS FR-079 bol search.js + products-ok fixture stay-dark; hostile pins; merged; #632 closed)
- a-search Phase-2 stay-dark bol worker: stack open normalize tip, assertWorkerEnv -> searchBol -> normalize -> writeResults, Closes worker + Refs search/normalize (#634) (bobiverse#3382, bobiverse#3383; context: FR-081 bol worker: PR https://github.com/SimonBarnett/a-search/pull/722 Closes #634; stacked on #721; 12 tests; stay-dark)
- Phase-2 bol normalize MRB: pin bolProductAPI.products + offerPrice/seller map + BOL_TRACKING_ID; keep enabled false (bobiverse#3384, bobiverse#3385, bobiverse#3386; context: MRB a-search#721 PASS FR-080 bol normalize stay-dark; hostile pins; merged; #633 closed)
- a-search Phase-2 stay-dark bol selftest: stack on open worker tip, selftestProbe + registry rateLimit, Closes selftest + Refs search/normalize/worker (#635) (bobiverse#3387; context: FR-082 bol selftestProbe+rateLimit: PR https://github.com/SimonBarnett/a-search/pull/723 Closes #635; 17 tests; stay-dark; stacked on #722)
- Phase-2 bol worker MRB: pin stay-dark + no stub + searchBol->normalize->writeResults; hostile e2e with bolProductAPI fixture (bobiverse#3388; context: MRB a-search#722 PASS FR-081 bol worker search->normalize->writeResults stay-dark; hostile pins; merged; #634 closed)
