---
name: a-search-kelkoo
description: >
  Maintain a-search kelkoo live API provider worker. Use in providers/live/kelkoo.
---

# a-search kelkoo (live)

Registry folder `providers/live/kelkoo`. Registry flags are enabled for live
and sandbox; CDK still keeps Kelkoo off fan-out when its bundled `.env` is
missing or incomplete.

## Search path (FR-063)

`src/search.js` — injectable `httpRequest`, Bearer `KELKOO_API_KEY`, fixture
`fixtures/offers-ok.json`.

## Normalize (FR-064/065)

`src/normalize.js` maps Shopping API offers → `worker/lib/normalizeProduct`:

| Kelkoo field | Product field |
|--------------|---------------|
| `offerId` | `id` |
| `title` | `title` |
| `landingPageUrl` | `url` via `buildTrackedUrl` + `KELKOO_PUBLISHER_ID` |
| `imageUrl` | `imageUrl` |
| `price` / `currency` | `price` / `currency` |
| `merchantName` | `description` (optional merchant label) |

Partial offers without `offerId`+`title` are skipped (no throw).

## Worker (FR-065)

`src/worker.js` — `run(msg)` / `handler`: `assertWorkerEnv` → `searchKelkoo` →
`normalizeSearchResponse` → `writeResults` (injectable HTTP + putObject).

FR #4823: write a-clubs IN/ only when `products.length >= 1`; 0 matches log
`provider_done products=0` (no IN, no DLQ).

## Selftest + pacing (FR-066)

`src/selftestProbe.js` — fixture (or injectable HTTP); live creds only when `httpRequest` is supplied (FR #4852);
returns `{ ok, source, latencyMs, error? }` for `/selftest`.
Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250` (CDK ESM wiring
is a later FR while stay-dark).

## Env

See `.env.example`. The ignored `providers/live/kelkoo/.env` must contain
`KELKOO_API_KEY` and `KELKOO_PUBLISHER_ID`; CDK bundles it into the worker only
when both are non-empty. If it is absent or incomplete, synth keeps the queue
and worker resources but omits the Kelkoo queue URL from entry, so `/search`
does not enqueue Kelkoo. The synth warning identifies the missing file and
required key names only, never credential values.

Queue env: `SQS_KELKOO_URL`. `KELKOO_PUBLISHER_ID` is required for tracked
landing URLs.

File gaps with Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search.
