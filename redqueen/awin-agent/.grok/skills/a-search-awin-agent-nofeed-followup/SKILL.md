---
name: a-search-awin-agent-nofeed-followup
description: >
  FR #4123 redqueen daily Awin onboarding agent — No-feed follow-up.
  Use in redqueen/awin-agent or /a-search-awin-agent-nofeed-followup.
---

# No-feed follow-up (Awin agent)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never commit or print Awin passwords, OTP codes, or feed API keys.

## Contract (FR #4123)
- Approved advertisers with no feed: folder `enabled=0`, `disabledreason=nofeed` (and `laststatus=missing_feedurl` as needed).
- Merge existing folder; never recreate; never reset `lastdownload` / `laststatus` / `lastsize`.

## Merc playbook body
PENDING from Merc for follow-up cadence / outreach text when supplied.