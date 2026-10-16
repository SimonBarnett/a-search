---
name: a-search-squarespace-onboarding
description: >
  Onboarding stub for registry id `squarespace` (merchant). Stay-dark until enabled.
  Use in providers/local/squarespace or /a-search-squarespace-onboarding.
---

# a-search squarespace onboarding

> CAST IRON harvest + intake to SimonBarnett/a-search. Never put tokens in filings.

Registry: **enabled live=false, sandbox=false** until ops enables after OAuth client approval.

## Obtain `.env`

Placeholders only in `.env.example`. App credentials live in Secrets Manager
`a-search/{env}/providers/squarespace/app`. Optional API-key fallback gated by
`SQUARESPACE_API_KEY_FALLBACK`.

## After enablement

Flip `providers/registry.json` enabled flags, expand this stub, run selftestProbe.

CAST IRON: file gaps with Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search (POST https://irc.ntsa.uk/bob/v1/intake).
