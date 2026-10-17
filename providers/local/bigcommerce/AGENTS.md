# AGENTS - a-search bigcommerce (local)

> **CAST IRON RULE - HARVEST AND FILE EVERYTHING (read this first, every time).**
> File gaps to SimonBarnett/a-search via intake. Never commit OAuth secrets.

Provider CWD for registry id `bigcommerce` (`kind: local`). Merchant source (FR-245).

## Read first

1. `.grok/skills/a-search-bigcommerce/SKILL.md`
2. `.grok/skills/a-search-bigcommerce-onboarding/SKILL.md`
3. `docs/fr/FR-245.md`

## CAST IRON

- App client id/secret live in Secrets Manager only; vault holds per-store token.
- Never log `access_token`, client secret, or signed_payload_jwt bodies.
- Results key: `{env}/bigcommerce/{userId}/{catalogId}/{searchId}.json`.
- Stay-dark until ops enables (`enabled.live` / `sandbox` false by default).

## Shape

- `src/catalog.js` / `src/normalize.js` / `src/upsert.js`
- `src/worker.js` + `src/queryParts.js` + `src/selftestProbe.js`
- Adapter: `shared/shops/adapters/bigcommerce.js` (OAuth + JWT verify)
