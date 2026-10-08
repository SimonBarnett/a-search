---
name: a-search-kelkoo
description: >
  Maintain a-search kelkoo live API provider worker. Use in providers/live/kelkoo.
---

# a-search kelkoo (live)

Registry folder `providers/live/kelkoo`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark — see `docs/phase2-providers.md`).

## Search path (FR-063)

`src/search.js` — injectable HTTP + `fixtures/offers-ok.json`.

## Selftest + pacing (FR-066)

`src/selftestProbe.js` — credential check + fixture (or injectable HTTP);
returns `{ ok, source, latencyMs, error? }` for `/selftest`.
Registry `rateLimit`: `maxConcurrency: 1`, `minIntervalMs: 250` (CDK ESM wiring
is a later FR while stay-dark).

## Worker stub

`src/worker.js` exports `run(msg)` — FR-065 wiring is separate.

## Env

See `.env.example`. Queue env: `SQS_KELKOO_URL`.
