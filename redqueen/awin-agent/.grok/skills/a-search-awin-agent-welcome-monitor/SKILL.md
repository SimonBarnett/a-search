---
name: a-search-awin-agent-welcome-monitor
description: >
  FR #4123 redqueen daily Awin onboarding agent — Welcome monitor.
  Use in redqueen/awin-agent or /a-search-awin-agent-welcome-monitor.
---

# Welcome monitor (Awin agent)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never commit or print Awin passwords, OTP codes, or feed API keys.

## Contract (FR #4123)
- IMAP mailbox `si@ntsa.uk`, folder `INBOX/Awin/Welcome`.
- Use welcomes + Awin "My Programmes" to detect approvals.
- Never store mailbox passwords in S3 or AGENT.md.

## Merc playbook body
PENDING from Merc. Paste IMAP filter / subject rules when supplied. Do not invent message templates.