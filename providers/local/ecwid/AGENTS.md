# AGENTS - a-search ecwid (local)

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

Provider CWD for registry id `ecwid` (`kind: local`). Merchant source (FR-246).

## Read first

1. `.grok/skills/a-search-ecwid/SKILL.md`
2. `.grok/skills/a-search-ecwid-onboarding/SKILL.md`
3. `docs/fr/FR-246.md`

## CAST IRON

- Token exchange is POST form body to `/api/oauth/token/{store_id}` - never query-string secrets.
- Store only the secret `access_token`; ignore `public_token`.
- Never log tokens, client secret, or webhook signatures.
- Results key: `{env}/ecwid/{userId}/{catalogId}/{searchId}.json`.
- Stay-dark until ops enables (`enabled.live` / `sandbox` false by default).

## Shape

- `src/catalog.js` / `src/normalize.js` / `src/upsert.js`
- `src/worker.js` + `src/queryParts.js` + `src/selftestProbe.js`
- Adapter: `shared/shops/adapters/ecwid.js` (OAuth + webhook HMAC)