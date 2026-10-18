---
name: a-search-bigcommerce-onboarding
description: >
  Onboarding stub for registry id `bigcommerce` (merchant). Stay-dark until enabled.
---

# a-search bigcommerce onboarding

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search or
>    POST https://irc.ntsa.uk/bob/v1/intake). Never leave a finding unfiled.
> 2. Never put tokens, passwords, client secrets, or store X-Auth-Token values in a filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.


Registry: **enabled live=false, sandbox=false** until app credentials exist and
ops follows `docs/phase3-enable-provider.md`.

Merchant clicks Add shop -> BigCommerce; `POST /merchant/shops/connect
{ provider:"bigcommerce" }` returns the app install URL. Scopes: Products
read-only + Information & Settings read-only. Auth callback
`/merchant/shops/callback/bigcommerce`. No legacy migrate script (Simon).
