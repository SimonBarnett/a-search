---
name: a-search-ecwid-onboarding
description: >
  Onboarding stub for registry id `ecwid` (merchant). Stay-dark until enabled.
---

# a-search ecwid onboarding

> **CAST IRON harvest + intake**
> 1. File gaps/bugs/FRs to SimonBarnett/a-search via bobiverse intake
>    (Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search ... or
>    POST https://irc.ntsa.uk/bob/v1/intake). Never leave a finding unfiled.
> 2. Harvest setup playbooks back into **this** skillbook when the source is enabled.
> 3. Never put tokens, passwords, client secrets, or store access tokens in a filing, skill, log, or commit.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

Registry: **enabled live=false, sandbox=false** until app credentials exist and
ops follows `docs/phase3-enable-provider.md`.

Merchant clicks Add shop -> Ecwid; `POST /merchant/shops/connect
{ provider:"ecwid" }` returns the authorize URL. Scopes:
`read_store_profile read_catalog`. Auth callback
`/merchant/shops/callback/ecwid` must parse both `code` and `store_id`.
