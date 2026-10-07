# AGENTS — a-search Awin local (`providers/local/awin`)

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

You are in the **Awin local provider** CWD. This folder owns the SQS
worker that **SELECTs MSSQL Parts** for Awin-sourced rows and writes
results JSON to S3. Feed **ingest** is the maintainer (`../../../maintainer/`);
this folder owns feed-parser/creds hooks and the search read path.

## Read first

1. `.grok/skills/a-search-awin/SKILL.md`
2. Repo docs: `docs/parts-maintainer.md`, `docs/endpoint-search.md`,
   `docs/environments.md`, `docs/vision.md`
3. Shared helpers: `../../../worker/lib/` (results path / write when present)
4. Parts DDL: `../../../maintainer/sql/002_Parts.sql`

## CAST IRON

- Never commit MSSQL passwords, Awin publisher tokens, or feed URLs with
  embedded credentials.
- Respect `message.env` vs `A_SEARCH_ENV` — refuse cross-env jobs.
- Write results only at the canonical key
  `{env}/awin/{userId}/{catalogId}/{searchId}.json`.
- Do **not** download CSV feeds from this worker; that is maintainer work.

## Shape

- `src/worker.js` — `run(msg, deps?)` → queryParts → normalize → writeResults
- `src/queryParts.js` — parameterized `dbo.Parts` SELECT (injectable `connect`)
- `.env.example` — MSSQL + queue/S3 knobs (Awin feed secrets for parser FRs)

Harvest Awin playbooks into
`.grok/skills/a-search-awin/SKILL.md`.
