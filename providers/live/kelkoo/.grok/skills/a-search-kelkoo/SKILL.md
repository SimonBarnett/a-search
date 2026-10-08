---
name: a-search-kelkoo
description: >
  Maintain a-search kelkoo live API provider worker. Use in providers/live/kelkoo.
---

# a-search kelkoo (live)

Registry folder `providers/live/kelkoo`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark until credentials — see `docs/phase2-providers.md`).

## Search path (FR-063)

`src/search.js` — injectable `httpRequest`, Bearer `KELKOO_API_KEY`, fixture
`fixtures/offers-ok.json`.

## Normalize (FR-064)

`src/normalize.js` maps Shopping API offers → `worker/lib/normalizeProduct`:

| Kelkoo field | Product field |
|--------------|---------------|
| `offerId` | `id` |
| `title` | `title` |
| `landingPageUrl` | `url` (publisher landing from JWT session; no extra campaign rewrite in FR-064) |
| `imageUrl` | `imageUrl` |
| `price` / `currency` | `price` / `currency` |
| `merchantName` | `description` (optional merchant label) |

Partial offers without `offerId`+`title` are skipped (no throw).

## Selftest + pacing (FR-066)

`src/selftestProbe.js` — credential check + fixture (or injectable HTTP);
returns `{ ok, source, latencyMs, error? }` for `/selftest`.
Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250` (CDK ESM wiring
is a later FR while stay-dark).

## Worker stub

`src/worker.js` exports `run(msg)` — wiring search→normalize→writeResults is
FR-065 (separate).

## Env

See `.env.example`. Queue env: `SQS_KELKOO_URL`.
