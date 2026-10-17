---
name: a-search-ecwid
description: >
  Ecwid (Lightspeed E-Series) app OAuth shop connect + catalogue for a-search.
  Use in providers/local/ecwid or /a-search-ecwid.
---

# a-search ecwid (merchant)

> CAST IRON harvest + intake to SimonBarnett/a-search. Never commit tokens.

## Auth (FR-246)

- Authorize -> callback with `code` + `store_id` (required since 2025-09).
- Token: POST form to `/api/oauth/token/{store_id}` (never GET / query secrets).
- Secret token is **non-expiring** while installed; ignore `public_token`.
- Uninstall webhook: HMAC-SHA256 Base64 of `{eventCreated}.{eventId}` vs
  `X-Ecwid-Webhook-Signature` using client secret.
- 401 sync -> `suspended(auth)`.

## Catalogue

- `GET /api/v3/{storeId}/products?enabled=true&limit=100&offset=N`.
- Honour 429 + `Retry-After`.
- Parts: `Source=ecwid`, `FeedKey=shopId`, `MerchantProductId=product id`.
- One Parts row per product (parent); use `defaultDisplayedPrice` when present.

## Adapter

`shared/shops/adapters/ecwid.js` registered as `ecwid`.
