---
name: a-search-bol
description: >
  Maintain a-search bol live API provider worker. Use in providers/live/bol.
---

# a-search bol (live)

Registry folder `providers/live/bol`. Enabled: live=false, sandbox=false
(CAST IRON stay-dark -- see `docs/phase2-providers.md`).

## Env

See `.env.example`. Queue env: `SQS_BOL_URL`. Creds: `BOL_API_KEY` (or `BOL_CLIENT_ID`).

## Search path (FR-079)

`src/search.js` -- injectable `httpRequest`, GET `{BOL_API_BASE}/catalog/v4/search`
with `X-API-KEY` / `BOL_API_KEY`, fixture `fixtures/products-ok.json`
(`bolProductAPI.products[]`). Stay-dark.

## Normalize / worker

Normalize (FR-080) and worker wiring (FR-081) are separate later FRs.

## Selftest

SelftestProbe + rateLimit (FR-082) is a later FR.
