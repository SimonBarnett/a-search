---
name: a-search-awin-agent-daily-signups
description: >
  FR #4123 redqueen daily Awin onboarding agent — Daily signups.
  Use in redqueen/awin-agent or /a-search-awin-agent-daily-signups.
---

# Daily signups (Awin agent)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never commit or print Awin passwords, OTP codes, or feed API keys.

## Contract (FR #4123)
- Daily scheduled run on redqueen (Grok first, Cursor fallback).
- Single-instance lock; second start exits 0 `already_running`.
- Report: `C:\ai\a-search\logs\awin-agent\{yyyy-mm-dd}.json` — counts + advertiser ids only, never secrets. Not under `a-affiliates/awin/`.

## Merc playbook body
PENDING from Merc for any signup-row nuances beyond a-affiliates folder writes.