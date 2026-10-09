# AGENTS — a-search Awin onboarding (`providers/local/awin/onboarding`)

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

You are in the **Awin local onboarding** CWD. This folder owns the scheduled
drain runner (`src/run.js` → `runOnce`) that processes Awin join / signup
work until `remaining===0`. Sandbox uses fixtures only; live uses injectable
HTTP (`fetchJoinedProgrammes`) per FR-125.

## Read first

1. `.grok/skills/a-search-awin-onboarding/SKILL.md`
2. `docs/onboarding-agents.md` (drain + signup contract)
3. Parent provider: `../AGENTS.md` and `../.grok/skills/a-search-awin/SKILL.md`

## Shape

- `src/run.js` — `runOnce(deps)` returning `{ processed, remaining, signups }`
  (sandbox fixture drain; live HTTP drain with `deps.httpGet`)
- `.env.example` — onboarding-only placeholders (no secrets committed)
- Drain helper: `shared/onboarding/drain.js` (on main)
- Pin: `tests/fr125-awin-onboarding-live-drain.test.js`
