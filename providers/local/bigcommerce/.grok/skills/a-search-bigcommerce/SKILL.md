---
name: a-search-bigcommerce
description: >
  BigCommerce single-click app OAuth shop connect + catalogue for a-search.
  Use in providers/local/bigcommerce or /a-search-bigcommerce.
---

# a-search bigcommerce (merchant)

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search or
>    POST https://irc.ntsa.uk/bob/v1/intake). Never leave a finding unfiled.
> 2. Never put tokens, passwords, client secrets, or store X-Auth-Token values in a filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.


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
