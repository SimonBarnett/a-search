---
name: a-search-kelkoo
description: >
  Maintain a-search kelkoo live API provider worker. Use in providers/live/kelkoo.
---

# a-search kelkoo (live)

Registry folder `providers/live/kelkoo`. Enabled: live=false, sandbox=false.

## Search path

Live kelkoo API client lands in a later FR.

## Worker stub

`src/worker.js` exports `run(msg)`.

## Env

See `.env.example`. Queue env: `SQS_KELKOO_URL`.
## Normalize mapping (FR-064/065)

- API `offers[]` → product: `offerId`→`id`, `title`, `price`, `currency`, `imageUrl`
- `landingPageUrl` → tracked `url` via `buildTrackedUrl` + `KELKOO_PUBLISHER_ID`
- Worker: `searchKijiji`/`searchKelkoo` → `normalizeSearchResponse` → `writeResults`
