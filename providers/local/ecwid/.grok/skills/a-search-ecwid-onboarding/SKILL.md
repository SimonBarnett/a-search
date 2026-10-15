---
name: a-search-ecwid-onboarding
description: >
  Onboarding stub for registry id `ecwid` (merchant). Stay-dark until enabled.
---

# a-search ecwid onboarding

Registry: **enabled live=false, sandbox=false** until app credentials exist and
ops follows `docs/phase3-enable-provider.md`.

Merchant clicks Add shop -> Ecwid; `POST /merchant/shops/connect
{ provider:"ecwid" }` returns the authorize URL. Scopes:
`read_store_profile read_catalog`. Auth callback
`/merchant/shops/callback/ecwid` must parse both `code` and `store_id`.
