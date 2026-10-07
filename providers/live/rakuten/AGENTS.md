# AGENTS — a-search Rakuten live (`providers/live/rakuten`)

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

You are in the **Rakuten live provider** CWD. This folder owns the SQS
worker for Rakuten Product Search (often **XML** responses) and S3
results write.

## Read first

1. `.grok/skills/a-search-rakuten/SKILL.md` — XML + rate limits
2. Repo docs: `docs/endpoint-search.md`, `docs/environments.md`

## CAST IRON

- Never commit Rakuten application keys or affiliate tokens.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/rakuten/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub
- `.env.example` — Rakuten credential placeholders + queue/S3 knobs
