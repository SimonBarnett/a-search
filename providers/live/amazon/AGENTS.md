# AGENTS — a-search Amazon live (`providers/live/amazon`)

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

You are in the **Amazon live provider** CWD. This folder owns the SQS
worker that calls Amazon **PA-API SearchItems** (Phase 1 LOCKED — FR-045)
and writes results JSON to S3. Creators API is a follow-up FR. It does
**not** own JWT accept or MSSQL maintainer.

## Read first

1. `.grok/skills/a-search-amazon/SKILL.md` (maintain / runtime)
2. `.grok/skills/a-search-amazon-onboarding/SKILL.md` (setup / FR-060c)
3. Repo docs: `docs/endpoint-search.md`, `docs/environments.md`, `docs/vision.md`, `docs/provider-onboarding-skills.md`
4. Shared helpers: `../../../worker/lib/` (results path / write when present)

## CAST IRON

- Never commit Amazon access keys, secret keys, or partner tags.
- Respect `message.env` vs `A_SEARCH_ENV` — refuse cross-env jobs.
- Write results only at the canonical key
  `{env}/amazon/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub (FR-030 lands live HTTP client)
- `.env.example` — Amazon credential placeholders + queue/S3 knobs

Harvest Amazon **runtime** playbooks into
`.grok/skills/a-search-amazon/SKILL.md`. Harvest **setup** playbooks into
`.grok/skills/a-search-amazon-onboarding/SKILL.md`.
