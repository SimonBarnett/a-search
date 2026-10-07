---
name: a-search-awin-onboarding
description: >
  Awin local onboarding drain CWD: runOnce stub, schedule drain until
  remaining=0, signup rows for daily report. Use in
  providers/local/awin/onboarding or /a-search-awin-onboarding.
---

# a-search awin onboarding (drain CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

> **CAST IRON:** Never commit Awin API tokens. Keep them in this folder’s
> `.env` (or parent `providers/local/awin/.env`) only.

You are in **`providers/local/awin/onboarding/`** — scheduled onboarding
runner for registry id `awin` (`kind: local`).

## Contract

- `src/run.js` exports `runOnce(deps) -> { processed, remaining, signups[] }`
- Orchestrator: `shared/onboarding/drain.js` loops until **`remaining===0`**
  then exit 0 (see `docs/onboarding-agents.md`)
- Signup fields: `source`, `env`, `merchantId`, `merchantName`, `signedUpAt`, `status`
- Legacy: madeira-awin-clubscan `routes/onboarding.js`

## Stub status (FR-049c)

`runOnce` returns empty drain (`remaining: 0`, no signups). Live Awin join
API is FR-050.
