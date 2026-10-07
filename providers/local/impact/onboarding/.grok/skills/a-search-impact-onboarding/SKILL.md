---
name: a-search-impact-onboarding
description: >
  Impact local onboarding drain CWD: runOnce, schedule drain until
  remaining=0, pending-queue when join API UNKNOWN, signup rows for daily
  report. Use in providers/local/impact/onboarding or
  /a-search-impact-onboarding.
---

# a-search impact onboarding (drain CWD)

> **CAST IRON harvest:** file every issue/FR/gap via
> `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest ...`
> or `POST https://irc.ntsa.uk/bob/v1/intake` with the same `-Repo`.
> Promote playbooks as a PR to SimonBarnett/a-search (honesty box).
> Never park a-search product lessons under bobiverse harvest/SKILL.md.

> **CAST IRON:** Never commit Impact API tokens or MSSQL passwords. Keep them
> in this folder’s `.env` (or parent `providers/local/impact/.env`) only.

You are in **`providers/local/impact/onboarding/`** — scheduled onboarding
runner for registry id `impact` (`kind: local`).

## Pending queue (join API UNKNOWN)

Impact catalogue-join / partner-discovery API is **UNKNOWN**. Drain
`dbo.ImpactPendingOnboard` (see `docs/impact-pending-onboard-queue.md` and
`docs/sql/001_ImpactPendingOnboard.sql`) so the schedule can still reach
**`remaining === 0`**.

Injectable queue ops: `listPending` / `markProcessed` / `countRemaining`
(or `createMemoryPendingQueue` / `pendingRows` in tests).

## Contract

- `src/run.js` exports `runOnce(deps) -> { processed, remaining, signups[] }`
- `src/emitSignupRow.js` — required keys match Awin subset
  (`user_id`, `company_name`, `email`, `advertiserId`, `env`); default
  `source: impact`. Persist to S3/MSSQL is FR-052.
- Orchestrator: `shared/onboarding/drain.js` loops until **`remaining===0`**
  then exit 0 (see `docs/onboarding-agents.md` when present)

## Drain playbook (until remaining=0)

1. Load this skill and `AGENTS.md` in this CWD.
2. Ensure `.env` from `.env.example` (MSSQL + `A_SEARCH_ENV`; no secrets committed).
3. Invoke `runOnce(deps)` (or the schedule entry that calls it).
4. Inspect `{ processed, remaining, signups[] }`.
5. **Loop** while `remaining > 0`: call `runOnce` again (same deps/state).
   Prefer `shared/onboarding/drain.js` when present; otherwise the scheduler
   / operator loops until **`remaining === 0`**, then exit 0.
6. Cap iterations with `ONBOARDING_MAX_ITERATIONS` so a stuck remaining never
   spins forever.
7. Report `signups[]` for the daily onboarding feed; do not log tokens.

Empty drain (`remaining: 0`, no new signups) is success when the pending
queue is clear.

## Modules (this CWD)

| File | Role |
|------|------|
| `src/run.js` | `runOnce` — pending-queue drain + signup emit |
| `src/emitSignupRow.js` | Daily-report signup row (FR-051c) |

## Status

FR-051d skillbook pin: CAST IRON harvest + drain-until-remaining=0 playbook.
Code changes are out of scope for FR-051d.
