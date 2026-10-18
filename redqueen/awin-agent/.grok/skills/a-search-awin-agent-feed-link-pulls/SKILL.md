---
name: a-search-awin-agent-feed-link-pulls
description: >
  FR #4123 redqueen daily Awin onboarding agent — Feed link pulls.
  Use in redqueen/awin-agent or /a-search-awin-agent-feed-link-pulls.
---

# Feed link pulls (Awin agent)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never commit or print Awin passwords, OTP codes, or feed API keys.

## Contract (FR #4123)
- For each approved advertiser, pull feed link via Create-a-Feed or Feed List export (Merc playbook).
- `feedurl` keeps literal `{feedapikey}` (or `{darwinhash}`) placeholder; real key only on `awin/` provider marker.
- `enabled=1` only after feed URL verified.

## Merc playbook body
PENDING from Merc. Paste Create-a-Feed / Feed List steps when supplied.