# AGENTS — a-search entry (`entry/`)

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

You are in the **entry** CWD. This folder owns the JWT-authenticated
`POST /search` accept path and fan-out enqueue. It does **not** hold
provider API secrets or run provider workers.

## Read first

1. `.grok/skills/a-search-entry/SKILL.md` — architecture, env, JWT, fan-out
2. Repo docs: `docs/endpoint-search.md`, `docs/environments.md`, `docs/vision.md`
3. Registry: `../providers/registry.json` + `../providers/loadRegistry.js`

## CAST IRON

- Never put JWTs, passwords, JWKS secrets, or connection strings in
  committed files, harvest filings, or chat paste beyond what the human shared.
- Never store provider credentials (`AMAZON_*`, `EBAY_*`, Awin keys, …) here.
  Those live in each provider folder’s `.env`.
- `userId` comes from the JWT claim only — never trust a body `userId`.
- Live and sandbox must not share queues, SQL, or result prefixes.

## Shape

- `src/index.js` — HTTP handler stub (JWT verify + fan-out land in later FRs)
- `.env.example` — `JWT_*` and `A_SEARCH_ENV` placeholders only

Harvest lessons for the entry path back into
`.grok/skills/a-search-entry/SKILL.md` on this product repo.
