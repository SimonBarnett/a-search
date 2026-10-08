---
name: a-search-kelkoo
description: >
  Maintain a-search kelkoo live API provider worker. Use in providers/live/kelkoo.
---

# a-search kelkoo (live)

Registry folder `providers/live/kelkoo`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark — see `docs/phase2-providers.md`).

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

## Selftest + pacing (FR-066 when present)

`src/selftestProbe.js` when landed; registry `rateLimit` while stay-dark.

## Env

See `.env.example`. Queue env: `SQS_KELKOO_URL`. Requires `KELKOO_PUBLISHER_ID`
for tracked landing URLs.
