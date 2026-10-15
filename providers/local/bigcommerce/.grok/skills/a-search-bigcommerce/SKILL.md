---
name: a-search-bigcommerce
description: >
  BigCommerce single-click app OAuth shop connect + catalogue for a-search.
  Use in providers/local/bigcommerce or /a-search-bigcommerce.
---

# a-search bigcommerce (merchant)

> CAST IRON harvest + intake to SimonBarnett/a-search. Never commit tokens.

## Auth (FR-245)

- App install deep-link -> Auth callback exchanges `code` + `context=stores/{hash}`.
- Token is **non-expiring** store-scoped `X-Auth-Token`.
- Load/Uninstall: verify `signed_payload_jwt` HS256 with client secret + `aud`.
- Uninstall -> Shop `suspended(uninstalled)`. 401 sync -> `suspended(auth)`.

## Catalogue

- `GET /stores/{hash}/v3/catalog/products?include=variants,images,primary_image&is_visible=true&limit=250`.
- Honour `X-Rate-Limit-Requests-Left` / `X-Rate-Limit-Time-Reset-Ms` and 429.
- Parts: `Source=bigcommerce`, `FeedKey=shopId`, `MerchantProductId=product id`.
- One Parts row per product (parent); use `calculated_price` when present.

## Adapter

`shared/shops/adapters/bigcommerce.js` registered as `bigcommerce`.
