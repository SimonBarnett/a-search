# AGENTS — a-search maintainer (`maintainer/`)

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

You are in the **maintainer** CWD. This folder owns the **scheduled**
local-parts refresh: roll stale feed keys from MSSQL, conditional
download, staging + set-based MERGE/deletes. It does **not** run
`POST /search` or live provider API clients.

## Read first

1. `.grok/skills/a-search-maintainer/SKILL.md` — roll, conditional GET, MERGE
2. Repo docs: `docs/parts-maintainer.md`, `docs/environments.md`, `docs/vision.md`
3. Local provider folders: `../providers/local/<id>/` own feed parsers + secrets

## CAST IRON

- Never put MSSQL passwords, feed API keys, or tokens in committed files.
- Live and sandbox use separate SQL targets and staging paths (`A_SEARCH_ENV`).
- Scope deletes to the current feed key — never global truncate.
- Search workers only **read** Parts; they do not download CSVs.

## Shape

- `src/schedule.js` — EventBridge entry: roll → conditional fetch → upsert → scoped delete (inject SQL/HTTP deps)
- `.env.example` — MSSQL + `MAINTAINER_TOP` + `A_SEARCH_ENV` placeholders

Harvest maintainer playbooks into
`.grok/skills/a-search-maintainer/SKILL.md` on this product repo.
