# AGENTS - a-search ecwid (local)

> **CAST IRON RULE - HARVEST AND FILE EVERYTHING (read this first, every time).**
> File gaps to SimonBarnett/a-search via intake. Never commit OAuth secrets.

Provider CWD for registry id `ecwid` (`kind: local`). Merchant source (FR-246).

## Read first

1. `.grok/skills/a-search-ecwid/SKILL.md`
2. `.grok/skills/a-search-ecwid-onboarding/SKILL.md`
3. `docs/fr/FR-246.md`

## CAST IRON

- Token exchange is POST form body to `/api/oauth/token/{store_id}` — never query-string secrets.
- Store only the secret `access_token`; ignore `public_token`.
- Never log tokens, client secret, or webhook signatures.
- Results key: `{env}/ecwid/{userId}/{catalogId}/{searchId}.json`.
- Stay-dark until ops enables (`enabled.live` / `sandbox` false by default).

## Shape

- `src/catalog.js` / `src/normalize.js` / `src/upsert.js`
- `src/worker.js` + `src/queryParts.js` + `src/selftestProbe.js`
- Adapter: `shared/shops/adapters/ecwid.js` (OAuth + webhook HMAC)
