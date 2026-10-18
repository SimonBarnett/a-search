---
name: a-search-awin-agent-merchant-feed-key
description: >
  FR #4123 redqueen daily Awin onboarding agent — Merchant feed key.
  Use in redqueen/awin-agent or /a-search-awin-agent-merchant-feed-key.
---

# Merchant feed key (Awin agent)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never commit or print Awin passwords, OTP codes, or feed API keys.

## Contract (FR #4123)
- Merchant feed key stays on the `a-affiliates/awin/` provider marker (`apitoken` / network key fields), never on advertiser folders and never in reports.
- Advertiser `feedurl` uses `{feedapikey}` placeholder only.

## Merc playbook body
PENDING from Merc. Paste where the feed API key is read in the UI/API when supplied.