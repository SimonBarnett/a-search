---
name: a-search-awin-onboarding
description: >
  Awin local onboarding drain CWD: runOnce, schedule drain until
  remaining=0, signup rows for daily report, clubscan parity pointer.
  Use in providers/local/awin/onboarding or /a-search-awin-onboarding.
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

## Clubscan parity (legacy)

Canonical legacy join/signup flow lives in madeira-awin-clubscan:

- Tree: https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan
- Onboarding route: https://github.com/SimonBarnett/AWS/blob/main/Lambdas/madeira-awin-clubscan/routes/onboarding.js

Read that `routes/onboarding.js` before changing fetch/create/signup behaviour
here. a-search mirrors the clubscan intent (joined programmes → merchant user
→ signup row) under this CWD; do not invent a divergent live contract.

## Contract

- `src/run.js` exports `runOnce(deps) -> { processed, remaining, signups[] }`
- Signup fields: `source`, `env`, `merchantId`, `merchantName`, `signedUpAt`, `status`
- Sandbox (`A_SEARCH_ENV=sandbox`): fixture programmes only — never live Awin HTTP
- Live (`A_SEARCH_ENV=live`): `fetchJoinedProgrammes` via injectable `httpGet`
  → `createMerchantUser` → `emitSignupRow` (FR-125). Missing `httpGet` fails closed
  (no silent empty drain). Optional `deps.batchSize` leaves `remaining > 0` until
  the shared drain loop finishes. Pin: `tests/fr125-awin-onboarding-live-drain.test.js`
  + `tests/fixtures/awin-joined-programmes.json`.

## Drain playbook (until remaining=0)

1. Load this skill and `AGENTS.md` in this CWD.
2. Ensure `.env` from `.env.example` (no secrets committed).
3. Invoke `runOnce(deps)` (or the schedule entry that calls it).
   Live deps must include `httpGet` (and Awin creds in env).
4. Inspect `{ processed, remaining, signups[] }`.
5. **Loop** while `remaining > 0`: call `runOnce` again (same deps/state).
   Prefer `shared/onboarding/drain.js` when present on the branch; otherwise
   the scheduler / operator loops until **`remaining === 0`**, then exit 0.
6. Cap iterations with a safety max so a stuck remaining never spins forever.
7. Persist/report `signups[]` for the daily onboarding report; do not log tokens.

Empty drain (`remaining: 0`, no new signups) is success when the queue is clear
(second tick after a finished live or sandbox drain).

## Modules (this CWD)

| File | Role |
|------|------|
| `src/run.js` | `runOnce` — sandbox fixture drain / live HTTP drain (FR-125) |
| `src/fetchJoinedProgrammes.js` | Awin joined programmes (FR-050a) |
| `src/createMerchantUser.js` | Idempotent merchant user by email (FR-050b) |
| `src/emitSignupRow.js` | Daily-report signup row (FR-050c) |

## Status

FR-049c scaffold + FR-050a–e helpers/sandbox + **FR-125 live HTTP drain**
(fixture-backed, injectable `httpGet`, `remaining=0` exit). MSSQL
UserApiKeys / MerchantProducts wiring and dual-writer cutover with legacy
clubscan remain later FRs (see operator notes on #954).
