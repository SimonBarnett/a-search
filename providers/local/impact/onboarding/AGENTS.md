# AGENTS — a-search Impact onboarding (`providers/local/impact/onboarding`)

> **CAST IRON RULE - HARVEST AND FILE EVERYTHING (read this first, every time).**
> 1. ALWAYS harvest skills you learn and file EVERY issue / FR / bug / gap you find in the
>    SAME turn. Never leave a finding unfiled, never "note it for later", never skip it because it is small.
> 2. File with the Bobiverse intake webhook (no secret or login needed;
>    `POST https://irc.ntsa.uk/bob/v1/intake`; offline it is queued locally and retried):
>    `Report-BobiverseIntakeIssue.ps1 -Repo SimonBarnett/a-search -Kind issue|fr|skill|harvest -Title "..." -Body "..."`
>    Always pass an explicit `-Repo SimonBarnett/a-search` for this product.
> 3. BEFORE finishing ANY debugging session: promote playbooks via PR to this repo (honesty box)
>    (or intake when push is blocked), then flush any offline intake queue.
> 4. Never put a token, password, JWT secret, MSSQL password, affiliate API key, or private
>    hostname in a filing, a skill, or a log.
> Never park a-search product lessons under bobiverse `harvest/SKILL.md`.

You are in the **Impact local onboarding** CWD. This folder owns the scheduled
drain runner (`src/run.js` → `runOnce`) that processes the pending-onboard
queue until **`remaining===0`**. Live Impact catalogue-join API is **UNKNOWN**;
use the MSSQL pending queue (`docs/impact-pending-onboard-queue.md`).

## Read first

1. `.grok/skills/a-search-impact-onboarding/SKILL.md` (CAST IRON + drain playbook)
2. `docs/impact-pending-onboard-queue.md` (DDL + env keys)
3. `docs/onboarding-agents.md` (shared drain + signup contract, on main)
4. Parent provider: `../AGENTS.md` and `../.grok/skills/a-search-impact/SKILL.md`

## Drain playbook (until remaining=0)

1. Load the skillbook above.
2. Set `.env` from `.env.example` (`A_SEARCH_ENV`, MSSQL_*).
3. Call `runOnce(deps)` → `{ processed, remaining, signups[] }`.
4. Loop while `remaining > 0` (prefer `shared/onboarding/drain.js`).
5. Exit **0** when **`remaining === 0`**; never spin forever (max-iterations cap).

## Shape

- `src/run.js` — `runOnce(deps)` drains pending rows + emits signup objects
- `src/emitSignupRow.js` — Awin-schema-subset signup rows
- `.env.example` — onboarding placeholders (no secrets committed)
- Drain helper: `shared/onboarding/drain.js` (on main)
