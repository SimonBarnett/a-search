---
name: a-search-bigcommerce-onboarding
description: >
  Onboarding stub for registry id `bigcommerce` (merchant). Stay-dark until enabled.
---

# a-search bigcommerce onboarding

Registry: **enabled live=false, sandbox=false** until app credentials exist and
ops follows `docs/phase3-enable-provider.md`.

Merchant clicks Add shop -> BigCommerce; `POST /merchant/shops/connect
{ provider:"bigcommerce" }` returns the app install URL. Scopes: Products
read-only + Information & Settings read-only. Auth callback
`/merchant/shops/callback/bigcommerce`. No legacy migrate script (Simon).
