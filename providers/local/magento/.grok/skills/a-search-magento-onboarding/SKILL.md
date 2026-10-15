---
name: a-search-magento-onboarding
description: >
  Onboarding stub for registry id `magento` (merchant). Stay-dark until enabled.
---

# a-search magento onboarding

Registry: **enabled live=false, sandbox=false** until ops enables.

Merchant creates Integration with Callback URL and Identity link URL from
`POST /merchant/shops/connect { provider:"magento" }` instructions. Resource
access: Catalog Products read + Stores Settings read only.
