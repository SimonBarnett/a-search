---
name: a-search-awin-agent-publisher-signin
description: >
  FR #4123 redqueen daily Awin onboarding agent — Publisher sign-in.
  Use in redqueen/awin-agent or /a-search-awin-agent-publisher-signin.
---

# Publisher sign-in (Awin agent)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Never park a-search product lessons under bobiverse harvest/SKILL.md.
> Never commit or print Awin passwords, OTP codes, or feed API keys.

## Contract (FR #4123)
- Publisher id `2889699`. Credentials: `C:\passwords\awin.secret.txt` (ACL SYSTEM+Administrators only). Merc format: line 1 email, line 2 password. Password never logged; typed from a temp file that is deleted after use.
- Persistent browser profile on redqueen so OTP is rare.
- If `id.awin.com/u/mfa-otp-challenge` (or captcha) appears: **stop**, notify Simon with step + affected advertiser ids, do not retry-loop.
- Prefer optional `apitoken` on `a-affiliates/awin/` provider marker for read-side API; joins/invites stay in the UI.

## Merc playbook body
PENDING from Merc (named FR-061 Awin operator skillbooks). Do **not** invent Awin UI element ids. Paste Merc's publisher sign-in steps here when supplied.