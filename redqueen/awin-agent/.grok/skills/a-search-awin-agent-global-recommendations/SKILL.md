---
name: a-search-awin-agent-global-recommendations
description: >
  FR #4123 redqueen daily Awin onboarding agent — Joins from Global Recommendations.
  Use in redqueen/awin-agent or /a-search-awin-agent-global-recommendations.
---

# Joins from Global Recommendations (Awin agent)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never commit or print Awin passwords, OTP codes, or feed API keys.

## Contract (FR #4123)
- Invite/join from Global Recommendations / Join Programmes.
- Prefer programmes with a product feed.
- Respect daily limits (`maxInvites` / `maxJoins`, default 20).
- `-DryRun`: list would-invite/join/create/update with no Awin side effects and no S3 writes.

## Merc playbook body
PENDING from Merc. Paste UI navigation for Global Recommendations when supplied.