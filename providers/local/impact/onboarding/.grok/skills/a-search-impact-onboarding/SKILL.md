---
name: a-search-impact-onboarding
description: >
  Impact local onboarding drain CWD: runOnce stub, schedule drain until
  remaining=0, signup rows for daily report. Use in
  providers/local/impact/onboarding or /a-search-impact-onboarding.
---

# a-search impact onboarding (drain CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

> **CAST IRON:** Never commit Impact API tokens. Keep them in this folder’s
> `.env` (or parent `providers/local/impact/.env`) only.

You are in **`providers/local/impact/onboarding/`** — scheduled onboarding
runner for registry id `impact` (`kind: local`).

## Contract

- `src/run.js` exports `runOnce(deps) -> { processed, remaining, signups[] }`
- Orchestrator: `shared/onboarding/drain.js` loops until **`remaining===0`**
  then exit 0 (see `docs/onboarding-agents.md`)
- Pending queue (API UNKNOWN): `docs/impact-pending-onboard-queue.md` +
  injectable `listPending` / `markProcessed` / `countRemaining` (or
  `createMemoryPendingQueue` / `pendingRows`)
- Signup fields: `source`, `env`, `merchantId`, `merchantName`, `signedUpAt`, `status`
  (persist is FR-051c — `signups` may be empty from runOnce today)

## Status

FR-051b: `runOnce` drains pending-onboard rows (empty → `remaining: 0`;
one row → processed then `remaining: 0`). Live Impact join API still UNKNOWN.
