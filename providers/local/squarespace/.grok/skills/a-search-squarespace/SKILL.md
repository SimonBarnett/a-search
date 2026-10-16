---
name: a-search-squarespace
description: >
  Maintain Squarespace Commerce merchant shop connect + catalogue ingest for a-search
  (OAuth offline refresh, API-key fallback, Parts MERGE). Use in providers/local/squarespace
  or /a-search-squarespace.
---

# a-search squarespace (merchant)

> CAST IRON harvest + intake to SimonBarnett/a-search. Never commit tokens.

## Auth (FR-242)

- OAuth authorize: `login.squarespace.com/.../authorize` with `access_type=offline` + `website.products.read`.
- Token exchange returns 30m access + 7d one-time refresh. Vault the **new** refresh token before use.
- Keep-alive every `SQUARESPACE_REFRESH_KEEPALIVE_DAYS` (default 5). Invalid refresh -> `suspended(auth)`.
- API key fallback when `SQUARESPACE_API_KEY_FALLBACK=true` (default until OAuth approved); flag `authMethod=api_key`.

## Catalogue

- `GET /v2/commerce/products` + User-Agent; cursor pages of 50; rateLimit maxConcurrency 1 / 250ms.
- Normalize variants -> Parts (`Source=squarespace`, `FeedKey=shopId`).

## Adapter

`shared/shops/adapters/squarespace.js` registered as `squarespace`.

CAST IRON: file gaps with Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search (POST https://irc.ntsa.uk/bob/v1/intake).
