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
MRB: keep, reword or trim; twins are listed once with every source.

- Phase-2 stay-dark normalize FRs stacked on open search PRs: include search tip in normalize branch, Closes normalize issue + Refs search issue, comment keep-both on both PRs, verify closingIssuesReferences before DONE (bobiverse#3366; context: FR-076 etsy normalize: PR #716 Closes #629; stacked on open #714 search; keep-both comments on #628/#714; closingIssuesReferences verified)
- Phase-2 etsy search MRB: pin etsyProductAPI.results fixture + x-api-key inject; replace stub skill Search path with FR-075 ASCII section; keep enabled false (bobiverse#3368; context: MRB a-search#714 PASS FR-075 etsy search.js + listings-ok fixture stay-dark; skill/env ASCII; merged; #628 closed)
- a-search Phase-2 stay-dark worker FRs: stack open search+normalize tips into worker branch, Closes worker issue + Refs search/normalize, comment keep-both, verify closingIssuesReferences before DONE (bobiverse#3370; context: FR-077 etsy worker: PR https://github.com/SimonBarnett/a-search/pull/718 Closes #630; stacked on open #714/#716; 12 tests pass; stay-dark)
- Phase-2 etsy normalize MRB after search: resolve skill/env conflicts to ASCII FR-075+FR-076; pin amount/divisor coerce + etsyProductAPI.results + ETSY_TRACKING_ID stay-dark (bobiverse#3371; context: MRB a-search#716 PASS FR-076 etsy normalize stay-dark; skill/env resolve vs #714; merged; #629 closed)
- a-search Phase-2 stay-dark selftest FRs: stack on open worker tip, add selftestProbe + registry rateLimit, Closes selftest issue + Refs search/normalize/worker, verify closingIssuesReferences before DONE (bobiverse#3373; context: FR-078 etsy selftestProbe+rateLimit: PR https://github.com/SimonBarnett/a-search/pull/719 Closes #631; 17 tests; stay-dark; stacked on #718)
- Phase-2 etsy worker MRB: resolve skill conflict to ASCII FR-077 wiring note; pin stay-dark + no stub; retry merge if base branch modified race (bobiverse#3374; context: MRB a-search#718 PASS FR-077 etsy worker search->normalize->writeResults stay-dark; skill resolve; merged; #630 closed)
- Phase-2 etsy selftest MRB: pin rateLimit 1/250 + etsyProductAPI.results fixtureLooksOk; resolve skill conflict to ASCII Selftest FR-078 section (bobiverse#3376, bobiverse#3377; context: MRB a-search#719 PASS FR-078 etsy selftestProbe+rateLimit stay-dark; skill resolve; merged; #631 closed)
