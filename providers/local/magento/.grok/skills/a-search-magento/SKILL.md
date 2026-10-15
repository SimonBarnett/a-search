---
name: a-search-magento
description: >
  Magento / Adobe Commerce Integration OAuth 1.0a shop connect + catalogue for a-search.
  Use in providers/local/magento or /a-search-magento.
---

# a-search magento (merchant)

> CAST IRON harvest + intake to SimonBarnett/a-search. Never commit tokens.

## Auth (FR-243)

- Magento Integration Activate POST -> hold consumer key/secret + verifier (10m).
- Identity link binds JWT merchant + nonce, then request/access token exchange.
- All REST calls OAuth 1.0a **HMAC-SHA256** with four credentials. Do not use Bearer.
- HTTPS public `store_base_url` only (SSRF). 401 sync -> `suspended(auth)`.

## Catalogue

- `GET /rest/V1/products` pageSize 100. Configurable default = **parent with min price**.
- Parts: `Source=magento`, `FeedKey=shopId`, `MerchantProductId=SKU`.

## Adapter

`shared/shops/adapters/magento.js` registered as `magento`.
