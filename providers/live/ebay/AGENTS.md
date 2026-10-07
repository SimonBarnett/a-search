# AGENTS — a-search eBay live (`providers/live/ebay`)

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

You are in the **eBay live provider** CWD. This folder owns the SQS worker
that calls the eBay Browse API and writes results JSON to S3.

## Read first

1. `.grok/skills/a-search-ebay/SKILL.md` (maintain / runtime)
2. `.grok/skills/a-search-ebay-onboarding/SKILL.md` (setup / FR-060d)
3. Repo docs: `docs/endpoint-search.md`, `docs/environments.md`, `docs/vision.md`, `docs/provider-onboarding-skills.md`
4. Shared helpers under `../../../worker/lib/` when present

## CAST IRON

- Never commit eBay OAuth client secrets or tokens.
- Refuse jobs when `message.env` !== `A_SEARCH_ENV`.
- Results key: `{env}/ebay/{userId}/{catalogId}/{searchId}.json`.

## Shape

- `src/worker.js` — `run(msg)` stub (Browse API client lands in a later FR)
- `.env.example` — eBay credential placeholders + queue/S3 knobs

Harvest eBay **runtime** playbooks into
`.grok/skills/a-search-ebay/SKILL.md`. Harvest **setup** playbooks into
`.grok/skills/a-search-ebay-onboarding/SKILL.md`.
