# AGENTS — a-search flexoffers (local)

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

Provider CWD for registry id `flexoffers` (`kind: local`).

## Read first

1. `.grok/skills/a-search-flexoffers/SKILL.md`
2. `.grok/skills/a-search-flexoffers-onboarding/SKILL.md` (disabled stub - UNKNOWN / not enabled)
3. `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit provider secrets.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/flexoffers/{userId}/{catalogId}/{searchId}.json`.

## Shape

- src/queryParts.js -- MSSQL Parts SELECT (FR-095; injectable connect)
- src/worker.js -- 
un(msg, deps) / writeResults (FR-095; stay-dark)
- .env.example -- placeholders (MSSQL_*, FLEXOFFERS_AFFILIATE_ID)
- `.env.example` — placeholders